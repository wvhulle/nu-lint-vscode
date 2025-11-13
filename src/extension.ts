import * as vscode from 'vscode';
import { NuLinter } from './linter';
import { NuLintCodeActionProvider } from './code-actions';

let linter: NuLinter | undefined;
let codeActionProvider: NuLintCodeActionProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const logger = vscode.window.createOutputChannel('Nu-Lint', { log: true });
    context.subscriptions.push(logger);
    logger.info('Nu-Lint extension is now active!');

    codeActionProvider = new NuLintCodeActionProvider();
    linter = new NuLinter(codeActionProvider, logger);
    context.subscriptions.push(linter);

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

    const lintFileCommand = vscode.commands.registerCommand('nu-lint.lintFile', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor !== undefined && (activeEditor.document.languageId === 'nushell' || activeEditor.document.languageId === 'nu')) {
            void linter?.lintDocument(activeEditor.document).catch((error: unknown) => {
                void vscode.window.showErrorMessage(`Lint failed: ${String(error)}`);
            });
        }
    });

    const lintWorkspaceCommand = vscode.commands.registerCommand('nu-lint.lintWorkspace', () => {
        void linter?.lintWorkspace().catch((error: unknown) => {
            void vscode.window.showErrorMessage(`Workspace lint failed: ${String(error)}`);
        });
    });

    const showLogsCommand = vscode.commands.registerCommand('nu-lint.showLogs', () => {
        logger.show();
    });

    context.subscriptions.push(lintFileCommand);
    context.subscriptions.push(lintWorkspaceCommand);
    context.subscriptions.push(showLogsCommand);
}

export function deactivate(): void {
    if (linter !== undefined) {
        linter.dispose();
    }
}