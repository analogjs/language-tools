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

  // Try each quote type, preferring the innermost match
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

    // Pick the tightest (innermost) match
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
 * Creates a Volar language service plugin that provides
 * route path completions and go-to-definition for Analog's file-based routing.
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
              const item: vscode.CompletionItem = {
                label: route.urlPath,
                kind: vscode.CompletionItemKind.File,
                detail: route.filePath.replace(/^.*\/src\//, 'src/'),
                sortText: route.params.length > 0 ? '1' : '0',
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
