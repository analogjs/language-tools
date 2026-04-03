import { create as createEmmetService } from 'volar-service-emmet';
import { create as createHtmlService } from 'volar-service-html';
import { create as createCssService } from 'volar-service-css';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { createServer, createConnection, createTypeScriptProject, loadTsdkByPath } from '@volar/language-server/node';
import type { LanguagePlugin } from '@volar/language-core';
import { URI } from 'vscode-uri';
import { RouteScanner } from './routeScanner';
import { createRoutingPlugin } from './plugins/routingPlugin';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params => {
	const tsdk = loadTsdkByPath(params.initializationOptions.typescript.tsdk, params.locale);

	// Initialize route scanner with the first workspace folder
	const workspaceFolders = params.workspaceFolders ?? [];
	let scanner: RouteScanner | undefined;

	if (workspaceFolders.length > 0) {
		const rootUri = URI.parse(workspaceFolders[0].uri);
		scanner = new RouteScanner(rootUri.fsPath);
		scanner.scan();
	}

	const servicePlugins = [
		createHtmlService(),
		createCssService(),
		createEmmetService(),
		...createTypeScriptServices(tsdk.typescript),
	];

	if (scanner) {
		servicePlugins.push(createRoutingPlugin(scanner));
	}

	// Language plugin that resolves angular-embedded-content URIs to HTML
	const angularEmbeddedPlugin: LanguagePlugin<URI> = {
		getLanguageId(uri) {
			if (uri.scheme === 'angular-embedded-content') {
				// URI ends with .html or contains /html/
				if (uri.path.endsWith('.html') || uri.path.includes('/html/')) {
					return 'html';
				}
				if (uri.path.endsWith('.css')) {
					return 'css';
				}
			}
			return undefined;
		},
	};

	return server.initialize(
		params,
		createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({
			languagePlugins: [angularEmbeddedPlugin]
		})),
		servicePlugins,
	);
});

// Re-scan routes when watched files change
connection.onDidChangeWatchedFiles(() => {
	// Scanner re-scan is triggered by the file watcher
	// This will be enhanced with incremental updates
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
