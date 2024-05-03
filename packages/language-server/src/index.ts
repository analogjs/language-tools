import { analogLanguagePlugin } from './languagePlugin';
import { create as createEmmetService } from 'volar-service-emmet';
import { create as createHtmlService } from 'volar-service-html';
import { create as createCssService } from 'volar-service-css';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { createServer, createConnection, createTypeScriptProjectProviderFactory, loadTsdkByPath } from '@volar/language-server/node';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params => {
	const tsdk = loadTsdkByPath(params.initializationOptions.typescript.tsdk, params.locale);
	return server.initialize(
		params,
		createTypeScriptProjectProviderFactory(tsdk.typescript, tsdk.diagnosticMessages),
		{
			getLanguagePlugins() {
				return [analogLanguagePlugin];
			},
			getServicePlugins() {
				return [
					createHtmlService(),
					createCssService(),
					createEmmetService(),
					...createTypeScriptServices(tsdk.typescript, {}),
				];
			},
		},
	);
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
