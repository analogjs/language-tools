import {
  forEachEmbeddedCode,
  type LanguagePlugin,
  type VirtualCode,
} from "@volar/language-core";
import type * as ts from "typescript";
import * as html from "vscode-html-languageservice";
import { URI } from "vscode-uri";

export const analogLanguagePlugin: LanguagePlugin<URI> = {
  getLanguageId(uri) {
    if (uri.path.endsWith(".analog") || uri.path.endsWith(".ag")) {
      return "analog";
    }
  },
  createVirtualCode(_uri, languageId, snapshot) {
    if (languageId === "analog") {
      return createAnalogCode(snapshot);
    }
  },
  typescript: {
    extraFileExtensions: [
      {
        extension: "analog",
        isMixedContent: true,
        scriptKind: 3 satisfies ts.ScriptKind.TS,
      },
    ],
    getServiceScript() {
      return undefined;
    },
    getExtraServiceScripts(fileName, root) {
      const scripts = [];
      for (const code of forEachEmbeddedCode(root)) {
        if (code.languageId === "javascript") {
          scripts.push({
            fileName: fileName + "." + code.id + ".js",
            code,
            extension: ".js",
            scriptKind: 1 satisfies ts.ScriptKind.JS,
          });
        } else if (code.languageId === "typescript") {
          scripts.push({
            fileName: fileName + "." + code.id + ".ts",
            code,
            extension: ".ts",
            scriptKind: 3 satisfies ts.ScriptKind.TS,
          });
        } else if (code.languageId === "typescriptreact") {
          scripts.push({
            fileName: fileName + "." + code.id + ".tsx",
            code,
            extension: ".ts",
            scriptKind: 4 satisfies ts.ScriptKind.TSX,
          });
        }
      }
      return scripts;
    },
  },
};

const htmlLs = html.getLanguageService();

export interface AnalogVirtualCode extends VirtualCode {
  // Reuse for custom service plugin
  htmlDocument: html.HTMLDocument;
}

function createAnalogCode(snapshot: ts.IScriptSnapshot): AnalogVirtualCode {
  const document = html.TextDocument.create(
    "",
    "html",
    0,
    snapshot.getText(0, snapshot.getLength()),
  );
  const htmlDocument = htmlLs.parseHTMLDocument(document);

  return {
    id: "root",
    languageId: "html",
    snapshot,
    mappings: [
      {
        sourceOffsets: [0],
        generatedOffsets: [0],
        lengths: [snapshot.getLength()],
        data: {
          completion: true,
          format: true,
          navigation: true,
          semantic: true,
          structure: true,
          verification: true,
        },
      },
    ],
    embeddedCodes: [...createEmbeddedCodes()],
    htmlDocument,
  };

  function extractAnalogImports(code: string) {
    const importRegex = /import\s*{(.*?)}\s+from\s+['"](.*?)['"];?/g;

    const symbolMap = new Map();
    const lines = code.split('\n');

    lines.forEach(line => {
      if (line.includes('analog:')) {
        let match;
        while ((match = importRegex.exec(line)) !== null) {
          const symbols = match[1].split(',').map(symbol => symbol.trim());
          const modulePath = match[2];

          symbols.forEach(symbol => {
            if (!symbolMap.has(symbol)) {
              symbolMap.set(symbol, new Set());
            }
            symbolMap.get(symbol).add(modulePath);
          });
        }
      }
    });

    let symbols: string[] = [];
    symbolMap.forEach((_, symbol) => {
      symbols.push(symbol);
    });

    return symbols;
  }

  function extractTemplateVariables(code: string) {
    const regex = /^(?!export\s)(let|const)\s+(\w+)\s*=\s*(.+?);|^(?!export\s)function\s+(\w+)\s*\(\s*\)\s*{/gm;

    const matches = code.matchAll(regex);

    let vars: string[] = [];
    for (const match of matches) {
      if (match[1]) {
        vars.push(`${match[2]}`);
      } else if (match[4]) {
        vars.push(`${match[4]}`);
      }
    }

    return vars;
  }

  function* createEmbeddedCodes(): Generator<VirtualCode> {
    let styles = 0;
    let scripts = 0;
    let langs = 0;

    for (const root of htmlDocument.roots) {
      if (
        root.tag === "style" &&
        root.startTagEnd !== undefined &&
        root.endTagStart !== undefined
      ) {
        const styleText = snapshot.getText(root.startTagEnd, root.endTagStart);
        yield {
          id: "style_" + styles++,
          languageId: "css",
          snapshot: {
            getText: (start, end) => styleText.substring(start, end),
            getLength: () => styleText.length,
            getChangeRange: () => undefined,
          },
          mappings: [
            {
              sourceOffsets: [root.startTagEnd],
              generatedOffsets: [0],
              lengths: [styleText.length],
              data: {
                completion: true,
                format: true,
                navigation: true,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ],
          embeddedCodes: [],
        };
      }
      if (
        root.tag === "script" &&
        root.startTagEnd !== undefined &&
        root.endTagStart !== undefined
      ) {
        const originalText = snapshot.getText(root.startTagEnd, root.endTagStart);
        const text = originalText.replace(/(with(((\n|\s)*).*)})/gm, function (_, _$1, $2) {
          // replace "with { analog: 'imports' }" with "/**with { analog: 'imports' }*/"
          // so its not evaluated inside the script tag
          return `/**${$2}*/`;
        });
        const imports = extractAnalogImports(originalText);
        const templateVars = extractTemplateVariables(originalText);
        const lang = root.attributes?.lang;
        const isTs = lang === "ts" || lang === '"ts"' || lang === "'ts'";
        yield {
          id: "script_" + scripts++,
          languageId: isTs ? "typescript" : "javascript",
          snapshot: {
            getText: (start, end) => `${text.substring(start, end)}

type AnalogComponentMetadata = Omit<import('@angular/core').Component, "template" |
  "standalone" |
  "changeDetection" |
  "styles" |
  "outputs" |
  "inputs"> & { exposes?: any[] };

/**
 * Defines additional metadata for the component such as the
 * selector, providers, and more.
 */
declare function defineMetadata(metadata: AnalogComponentMetadata): void;

/**
 * Defines the lifecycle hook(ngOnInit) that is called when the
 * component is initialized.
 */
declare function onInit(initFn: () => void): void;

/**
 * Defines the lifecycle hook(ngOnDestroy) that is called when the
 * component is destroyed.
 */
declare function onDestroy(destroyFn: () => void): void;

// @ts-ignore
[${templateVars.join(',')}];

// @ts-ignore
[${imports.join(',')}];`,
            getLength: () => text.length,
            getChangeRange: () => undefined,
          },
          mappings: [
            {
              sourceOffsets: [root.startTagEnd],
              generatedOffsets: [0],
              lengths: [text.length],
              data: {
                completion: true,
                format: true,
                navigation: true,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ],
          embeddedCodes: [],
        };
      }
      if (
        root.tag === "template" &&
        root.startTagEnd !== undefined &&
        root.endTagStart !== undefined
      ) {
        const text = snapshot.getText(root.startTagEnd, root.endTagStart);
        const lang = root.attributes?.lang;
        const isMd = lang === "md" || lang === '"md"' || lang === "'md'";
        yield {
          id: "lang_" + langs++,
          languageId: isMd ? "markdown" : "html",
          snapshot: {
            getText: (start, end) => text.substring(start, end),
            getLength: () => text.length,
            getChangeRange: () => undefined,
          },
          mappings: [
            {
              sourceOffsets: [root.startTagEnd],
              generatedOffsets: [0],
              lengths: [text.length],
              data: {
                completion: true,
                format: true,
                navigation: true,
                semantic: true,
                structure: true,
                verification: true,
              },
            },
          ],
          embeddedCodes: [],
        };
      }
    }
  }
}
