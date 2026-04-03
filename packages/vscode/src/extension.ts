import * as serverProtocol from '@volar/language-server/protocol';
import { createLabsInfo, getTsdk } from '@volar/vscode';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';
import * as path from 'node:path';
import * as fs from 'node:fs';

let client: lsp.BaseLanguageClient;

export async function activate(context: vscode.ExtensionContext) {

	const serverModule = vscode.Uri.joinPath(context.extensionUri, 'dist', 'server.js');
	const runOptions = { execArgv: <string[]>[] };
	const debugOptions = { execArgv: ['--nolazy', '--inspect=' + 6009] };
	const serverOptions: lsp.ServerOptions = {
		run: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: runOptions
		},
		debug: {
			module: serverModule.fsPath,
			transport: lsp.TransportKind.ipc,
			options: debugOptions
		},
	};
	const clientOptions: lsp.LanguageClientOptions = {
		documentSelector: [
			{ language: 'html' },
			{ language: 'typescript' },
			{ scheme: 'angular-embedded-content' },
		],
		initializationOptions: {
			typescript: {
				tsdk: (await getTsdk(context))!.tsdk,
			},
		},
	};
	client = new lsp.LanguageClient(
		'analog-language-server',
		'AnalogJS Language Server',
		serverOptions,
		clientOptions,
	);
	await client.start();

	// Register restart language server command
	context.subscriptions.push(
		vscode.commands.registerCommand('analogjs.restartServer', async () => {
			await client.stop();
			await client.start();
			vscode.window.showInformationMessage('AnalogJS Language Server restarted.');
		}),
	);

	// Register go-to-server-loader command
	context.subscriptions.push(
		vscode.commands.registerCommand('analogjs.goToServerLoader', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const filePath = editor.document.uri.fsPath;
			let targetPath: string | undefined;

			if (filePath.endsWith('.page.ts')) {
				targetPath = filePath.replace(/\.page\.ts$/, '.server.ts');
			} else if (filePath.endsWith('.server.ts')) {
				targetPath = filePath.replace(/\.server\.ts$/, '.page.ts');
			}

			if (targetPath && fs.existsSync(targetPath)) {
				const doc = await vscode.workspace.openTextDocument(targetPath);
				await vscode.window.showTextDocument(doc);
			} else if (targetPath) {
				const basename = path.basename(targetPath);
				vscode.window.showInformationMessage(`No paired file found: ${basename}`);
			}
		}),
	);

	// support for https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volarjs-labs
	const labsInfo = createLabsInfo(serverProtocol);
	labsInfo.addLanguageClient(client);
	return labsInfo.extensionExports;
}

export function deactivate(): Thenable<any> | undefined {
	return client?.stop();
}
