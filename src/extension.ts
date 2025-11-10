import * as vscode from 'vscode';
import { NuLinter } from './nuLinter';
import { NuLintCodeActionProvider } from './codeActionProvider';

let linter: NuLinter;
let codeActionProvider: NuLintCodeActionProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Nu-Lint extension is now active!');
    vscode.window.showInformationMessage('Nu-Lint extension activated!');

    codeActionProvider = new NuLintCodeActionProvider();
    linter = new NuLinter(codeActionProvider);
    context.subscriptions.push(linter);

    // Register code action provider for Nushell files
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'nushell' },
            codeActionProvider,
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        )
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'nu' },
            codeActionProvider,
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        )
    );

    // Debug: Log when documents are opened
    vscode.workspace.onDidOpenTextDocument(document => {
        console.log(`Document opened: ${document.fileName}, language: ${document.languageId}`);
    });

    const lintFileCommand = vscode.commands.registerCommand('nu-lint.lintFile', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && (activeEditor.document.languageId === 'nushell' || activeEditor.document.languageId === 'nu')) {
            linter.lintDocument(activeEditor.document);
        }
    });

    const lintWorkspaceCommand = vscode.commands.registerCommand('nu-lint.lintWorkspace', () => {
        linter.lintWorkspace();
    });

    context.subscriptions.push(lintFileCommand);
    context.subscriptions.push(lintWorkspaceCommand);
}

export function deactivate() {
    if (linter) {
        linter.dispose();
    }
}