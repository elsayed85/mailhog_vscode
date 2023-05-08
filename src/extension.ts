import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as WebSocket from 'ws';
import * as axios from 'axios';
import { startProxyServer } from './proxy-server';

let mailerWebviewPanel: vscode.WebviewPanel;

export function activate(context: vscode.ExtensionContext) {
	startProxyServer();

	const mailServerProvider = new MailServerProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('mailerView', mailServerProvider)
	);

	mailerWebviewPanel = createWebviewPanel(context);
	listenToMailhog(mailerWebviewPanel  , mailServerProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('mailer.openMailDetails', async (email: Email) => {
			mailerWebviewPanel.webview.postMessage({
				command: 'openMailDetails',
				email: email.email,
			});
		})
	);

}

function listenToMailhog(mailerWebviewPanel: vscode.WebviewPanel , mailServerProvider: MailServerProvider) {
	const mailhogSocket = new WebSocket('ws://localhost:8025/api/v2/websocket');
	// Listen for the open event, which is emitted when the connection is established
	mailhogSocket.on('open', () => {
		// console.log('Connected to MailHog WebSocket');
		mailerWebviewPanel.webview.postMessage({
			command: 'connectionStatus',
			conected: true,
		});
	});

	// Listen for the message event, which is emitted when a new email is received
	mailhogSocket.on('message', (rawData: any) => {
		// Parse the raw message data to JSON object
		const emailData = JSON.parse(rawData);
		if (emailData && emailData.Content) {
			mailerWebviewPanel.webview.postMessage({
				command: 'newEmail',
				email: emailData,
			});

			vscode.window.showInformationMessage('New email To: ' + emailData.Content.Headers.To + ' Subject: ' + emailData.Content.Headers.Subject);

			// // push to tree view
			// mailServerProvider.pushEmail(emailData);
		}
	});

	// Listen for the close event, which is emitted when the connection is closed
	mailhogSocket.on('close', () => {
		// console.log('Disconnected from MailHog WebSocket');
		mailerWebviewPanel.webview.postMessage({
			command: 'connectionStatus',
			conected: false,
		});
	});

	// Listen for the error event, which is emitted when an error occurs
	mailhogSocket.on('error', (error) => {
		// console.error('MailHog WebSocket error:', error);
		mailerWebviewPanel.webview.postMessage({
			command: 'connectionStatus',
			conected: false,
		});
	});
}

export function deactivate() { }

function createWebviewPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'Mailer',
		'Mailer',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
		}
	);

	panel.webview.onDidReceiveMessage(
		message => {
			switch (message.command) {

			}
		},
		undefined,
		context.subscriptions
	);

	const assets = [
		{ tag: '__CSS_PATH__', subpath: ['frontend', 'assets', 'tailwind.min.css'] },
		{ tag: '__MAIN_CSS_PATH__', subpath: ['frontend', 'assets', 'main.css'] },
		{ tag: '__VUE_PATH__', subpath: ['frontend', 'assets', 'vue.js'] },
		{ tag: '__AXIOS_PATH__', subpath: ['frontend', 'assets', 'axios.min.js'] },
		{ tag: '__CAIRO_REGULAR_PATH__', subpath: ['frontend', 'assets', 'fonts', 'Cairo-Regular.ttf'] },
		{ tag: '__CAIRO_BOLD_PATH__', subpath: ['frontend', 'assets', 'fonts', 'Cairo-Bold.ttf'] },
	];

	// hey vscode, this is where the html file is
	// we need to read it from disk and replace the asset tags with the actual asset paths
	// how it gets to the browser is not our concern

	const onDiskPath = vscode.Uri.file(path.join(context.extensionPath, 'frontend', 'webview.html'));
	let webviewHTML = fs.readFileSync(onDiskPath.fsPath, 'utf8');

	assets.forEach((asset) => {
		const assetUrl = getAssetPath(panel, context, ...asset.subpath);
		webviewHTML = webviewHTML.replace(asset.tag, assetUrl);
	});

	panel.webview.html = webviewHTML;

	return panel;
}

function getAssetPath(panel: any, context: any, ...paths: any) {
	const assetPath = path.join(context.extensionPath, ...paths);
	const assetPathOnDisk = vscode.Uri.file(assetPath);
	const assetPathForWebView = panel.webview.asWebviewUri(assetPathOnDisk);
	return assetPathForWebView.toString();
}

class Email extends vscode.TreeItem {
	constructor(public readonly email: any) {
		super(email.subject, vscode.TreeItemCollapsibleState.Collapsed);
		this.description = email.to;
		this.contextValue = 'email';
		this.command = {
			command: 'mailer.openMailDetails',
			title: 'Open Mail Details',
			arguments: [this],
		};
	}
}

class EmailDetails extends vscode.TreeItem {
	constructor(public readonly detailKey: string, public readonly detailValue: string) {
		super(
			`${detailKey}: ${detailValue}`,
			vscode.TreeItemCollapsibleState.None
		);
	}

	tooltip = `${this.detailKey}: ${this.detailValue}`;
}

class MailServerProvider
	implements vscode.TreeDataProvider<vscode.TreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();

	async getChildren(element?: Email): Promise<vscode.TreeItem[]> {
		if (!element) {
			const mails = await getLatestMails();
			return mails.map(
				(email: Email) => new Email(email)
			);
		}


		const email = element.email;
		return [
			new EmailDetails('From', email.from),
			new EmailDetails('To', email.to),
			new EmailDetails('Subject', email.subject),
			new EmailDetails('Date', email.date),
		];
	}


	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	pushEmail(email: any) {
		const newEmail = new Email(email);
		this._onDidChangeTreeData.fire(newEmail);
	}
}

async function getLatestMails() {
	const response = await axios.default.get('http://localhost:1234/api/v2/messages')
		.then((response) => {
			const messages = response.data.items;
			return messages.map((msg: any) => {
				return {
					id: msg.ID,
					from: msg.Content.Headers.From[0],
					to: msg.Content.Headers.To,
					subject: msg.Content.Headers.Subject[0],
					date: msg.Content.Headers['Date'][0],
					body: msg.Content.Body,
				};
			}).reverse();
		});

	return response;
}