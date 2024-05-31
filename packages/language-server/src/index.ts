import { analogLanguagePlugin } from './languagePlugin';
import { create as createEmmetService } from 'volar-service-emmet';
import { create as createHtmlService } from 'volar-service-html';
import { create as createCssService } from 'volar-service-css';
import { create as createTypeScriptServices } from 'volar-service-typescript';
import { createServer, createConnection, createTypeScriptProject, loadTsdkByPath } from '@volar/language-server/node';

const connection = createConnection();
const server = createServer(connection);

connection.listen();

connection.onInitialize(params => {
	const tsdk = loadTsdkByPath(params.initializationOptions.typescript.tsdk, params.locale);
	return server.initialize(
		params,
		[
			createHtmlService(),
			createCssService(),
			createEmmetService(),
			...createTypeScriptServices(tsdk.typescript, tsdk.diagnosticMessages),
		],
		createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => [analogLanguagePlugin]),
	);
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);
