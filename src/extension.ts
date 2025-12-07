import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('Nu-Lint');
    context.subscriptions.push(outputChannel);

    const config = vscode.workspace.getConfiguration('nu-lint');
    const executablePath = config.get<string>('executablePath', 'nu-lint');

    outputChannel.appendLine(`Starting nu-lint LSP from: ${executablePath}`);

    const serverOptions: ServerOptions = {
        command: executablePath,
        args: ['--lsp'],
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: 'nushell', scheme: 'file' },
            { language: 'nu', scheme: 'file' }
        ],
        outputChannel,
    };

    client = new LanguageClient(
        'nu-lint',
        'Nu-Lint Language Server',
        serverOptions,
        clientOptions
    );

    try {
        await client.start();
        context.subscriptions.push(client);
        outputChannel.appendLine('Nu-Lint LSP started successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start: ${message}`);
        void vscode.window.showErrorMessage(
            `Nu-Lint LSP failed to start: ${message}. Make sure nu-lint >= 0.0.62 is installed.`
        );
    }
}

export async function deactivate(): Promise<void> {
    if (client) {
        await client.stop();
    }
}