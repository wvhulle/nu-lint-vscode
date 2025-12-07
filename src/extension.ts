import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('nu-lint');
    const executablePath = config.get<string>('executablePath', 'nu-lint');

    const serverOptions: ServerOptions = {
        command: executablePath,
        args: ['--lsp'],
        transport: TransportKind.stdio
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: 'nushell', scheme: 'file' },
            { language: 'nu', scheme: 'file' }
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.nu')
        }
    };

    client = new LanguageClient(
        'nu-lint',
        'Nu-Lint Language Server',
        serverOptions,
        clientOptions
    );

    client.start();
    context.subscriptions.push(client);
}

export function deactivate(): Promise<void> | undefined {
    return client?.stop();
}