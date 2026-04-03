import type { LanguageServicePlugin } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { RouteScanner } from '../routeScanner';

/**
 * Check if a position is inside a string literal and return the string content.
 * Handles single quotes, double quotes, and backtick template literals.
 */
function getStringAtPosition(
  document: TextDocument,
  position: vscode.Position,
): { value: string; range: vscode.Range } | undefined {
  const line = document.getText(
    vscode.Range.create(position.line, 0, position.line + 1, 0),
  );
  const offset = position.character;

  const quotes = ['"', "'", '`'];
  let bestMatch: { value: string; range: vscode.Range; start: number } | undefined;

  for (const quote of quotes) {
    let start = -1;
    let end = -1;

    for (let i = offset - 1; i >= 0; i--) {
      if (line[i] === quote && (i === 0 || line[i - 1] !== '\\')) {
        start = i;
        break;
      }
    }
    if (start === -1) continue;

    for (let i = offset; i < line.length; i++) {
      if (line[i] === quote && line[i - 1] !== '\\') {
        end = i;
        break;
      }
    }
    if (end === -1) continue;

    if (!bestMatch || start > bestMatch.start) {
      const value = line.substring(start + 1, end);
      const range = vscode.Range.create(position.line, start + 1, position.line, end);
      bestMatch = { value, range, start };
    }
  }

  return bestMatch;
}

/**
 * Check if the string at position is in a routing context.
 */
function isRoutingContext(document: TextDocument, position: vscode.Position): boolean {
  const line = document.getText(
    vscode.Range.create(position.line, 0, position.line + 1, 0),
  );
  return /routerLink|\.navigate\(|\.navigateByUrl\(|route\(|injectNavigate|injectNavigateByUrl/.test(line);
}

/**
 * Extract a file system path from a document URI.
 */
function getDocumentFsPath(document: TextDocument): string | undefined {
  const uri = URI.parse(document.uri);
  if (uri.scheme === 'file') {
    return uri.fsPath;
  }
  if (uri.scheme === 'angular-embedded-content') {
    const decoded = decodeURIComponent(uri.path);
    const match = decoded.match(/file:\/\/(.+?)(?:\.html|\.css)?$/);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Find all route-path strings in a document and return their ranges and values.
 */
function findRouteStrings(document: TextDocument): { value: string; range: vscode.Range }[] {
  const text = document.getText();
  const results: { value: string; range: vscode.Range }[] = [];

  // Match routerLink="..." routerLink='...' [routerLink]="'...'"
  const patterns = [
    /routerLink\s*=\s*"(\/[^"]*)"/g,
    /routerLink\s*=\s*'(\/[^']*)'/g,
    /\[routerLink\]\s*=\s*"'(\/[^']*)'"/g,
    /\[routerLink\]\s*=\s*"\"(\/[^\"]*)\""/g,
    /\.navigateByUrl\(\s*['"](\/[^'"]*)['"]/g,
    /route\(\s*['"](\/[^'"]*)['"]/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1];
      const valueStart = match.index + match[0].indexOf(value);
      const startPos = document.positionAt(valueStart);
      const endPos = document.positionAt(valueStart + value.length);
      results.push({
        value,
        range: vscode.Range.create(startPos, endPos),
      });
    }
  }

  return results;
}

/**
 * Creates a Volar language service plugin that provides
 * route path completions, document links, and go-to-definition
 * for Analog's file-based routing.
 */
export function createRoutingPlugin(
  scanner: RouteScanner,
): LanguageServicePlugin {
  return {
    name: 'analog-routing',

    capabilities: {
      completionProvider: {
        triggerCharacters: ["'", '"', '/', '`'],
      },
      definitionProvider: true,
      documentLinkProvider: {},
    },

    create() {
      return {
        provideCompletionItems(document: TextDocument, position: vscode.Position) {
          if (!isRoutingContext(document, position)) {
            return undefined;
          }

          const stringInfo = getStringAtPosition(document, position);
          if (!stringInfo) return undefined;

          const documentPath = getDocumentFsPath(document);
          const routes = scanner.getRoutes(documentPath);
          if (routes.length === 0) return undefined;

          const items: vscode.CompletionItem[] = routes
            .filter((route) => !route.isCatchAll)
            .map((route) => {
              const hasParams = route.params.length > 0;
              let insertText: string;

              if (hasParams) {
                // Convert :param to ${N:param} snippet tab stops
                let tabIndex = 1;
                insertText = route.urlPath.replace(/:([^/]+)/g, () => {
                  const param = route.params[tabIndex - 1] || 'value';
                  return `\${${tabIndex++}:${param}}`;
                });
              } else {
                insertText = route.urlPath;
              }

              const item: vscode.CompletionItem = {
                label: route.urlPath,
                kind: vscode.CompletionItemKind.File,
                detail: route.filePath.replace(/^.*\/src\//, 'src/'),
                sortText: hasParams ? '1' : '0',
                insertTextFormat: hasParams ? 2 as const : 1 as const,
                textEdit: vscode.TextEdit.replace(stringInfo.range, insertText),
              };

              if (route.params.length > 0) {
                item.documentation = {
                  kind: vscode.MarkupKind.Markdown,
                  value: `**Parameters:** ${route.params.map((p) => '`:' + p + '`').join(', ')}`,
                };
              }

              if (route.serverFilePath) {
                const doc = item.documentation;
                const serverDetail = `\n\nHas server loader: \`${route.serverFilePath.replace(/^.*\/src\//, 'src/')}\``;
                if (typeof doc === 'object' && doc.kind === vscode.MarkupKind.Markdown) {
                  doc.value += serverDetail;
                } else {
                  item.documentation = {
                    kind: vscode.MarkupKind.Markdown,
                    value: serverDetail.trim(),
                  };
                }
              }

              return item;
            });

          return {
            isIncomplete: false,
            items,
          };
        },

        provideDocumentLinks(document: TextDocument) {
          const documentPath = getDocumentFsPath(document);
          const routeStrings = findRouteStrings(document);
          if (routeStrings.length === 0) return undefined;

          const links: vscode.DocumentLink[] = [];
          for (const { value, range } of routeStrings) {
            const matches = scanner.findByUrlString(value, documentPath);
            if (matches.length > 0) {
              links.push({
                range,
                target: URI.file(matches[0].filePath).toString(),
                tooltip: `Go to ${matches[0].filePath.replace(/^.*\/src\//, 'src/')}`,
              });
            }
          }

          return links;
        },

        provideDefinition(document: TextDocument, position: vscode.Position) {
          const stringInfo = getStringAtPosition(document, position);
          if (!stringInfo) return undefined;

          const value = stringInfo.value;
          if (!value.startsWith('/')) return undefined;

          const documentPath = getDocumentFsPath(document);
          const matches = scanner.findByUrlString(value, documentPath);
          if (matches.length === 0) return undefined;

          return matches.map((route): vscode.LocationLink => ({
            targetUri: URI.file(route.filePath).toString(),
            targetRange: vscode.Range.create(0, 0, 0, 0),
            targetSelectionRange: vscode.Range.create(0, 0, 0, 0),
            originSelectionRange: stringInfo.range,
          }));
        },
      };
    },
  };
}
