import * as vscode from 'vscode';
import { NuLinter } from './linter';
import { NuLintCodeActionProvider } from './code-actions';

let linter: NuLinter | undefined;
let codeActionProvider: NuLintCodeActionProvider | undefined;

function registerCodeActionProviders(context: vscode.ExtensionContext): void {
    if (!codeActionProvider) {
        return;
    }

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
}

function createLintFileCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('nu-lint.lintFile', () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        
        const isNushell = activeEditor.document.languageId === 'nushell' || activeEditor.document.languageId === 'nu';
        if (isNushell) {
            void linter?.lintDocument(activeEditor.document).catch((error: unknown) => {
                void vscode.window.showErrorMessage(`Lint failed: ${String(error)}`);
            });
        }
    });
}

function createLintWorkspaceCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('nu-lint.lintWorkspace', () => {
        void linter?.lintWorkspace().catch((error: unknown) => {
            void vscode.window.showErrorMessage(`Workspace lint failed: ${String(error)}`);
        });
    });
}

function createFixFileCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('nu-lint.fixFile', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            void vscode.window.showWarningMessage('No active editor');
            return;
        }
        
        const isNushell = activeEditor.document.languageId === 'nushell' || activeEditor.document.languageId === 'nu';
        if (!isNushell) {
            void vscode.window.showWarningMessage('Current file is not a Nushell file');
            return;
        }

        try {
            const edits = await linter?.fixDocument(activeEditor.document);
            if (edits && edits.length > 0) {
                const workspaceEdit = new vscode.WorkspaceEdit();
                workspaceEdit.set(activeEditor.document.uri, edits);
                const applied = await vscode.workspace.applyEdit(workspaceEdit);
                if (applied) {
                    void vscode.window.showInformationMessage('Fixes applied successfully');
                } else {
                    void vscode.window.showWarningMessage('Failed to apply fixes');
                }
            } else {
                void vscode.window.showInformationMessage('No fixes available');
            }
        } catch (error: unknown) {
            void vscode.window.showErrorMessage(`Fix failed: ${String(error)}`);
        }
    });
}

function createShowLogsCommand(logger: vscode.LogOutputChannel): vscode.Disposable {
    return vscode.commands.registerCommand('nu-lint.showLogs', () => {
        logger.show();
    });
}

export function activate(context: vscode.ExtensionContext): void {
    const logger = vscode.window.createOutputChannel('Nu-Lint', { log: true });
    context.subscriptions.push(logger);
    logger.info('Nu-Lint extension is now active!');

    codeActionProvider = new NuLintCodeActionProvider();
    linter = new NuLinter(codeActionProvider, logger);
    context.subscriptions.push(linter);

    registerCodeActionProviders(context);

    context.subscriptions.push(createLintFileCommand());
    context.subscriptions.push(createLintWorkspaceCommand());
    context.subscriptions.push(createFixFileCommand());
    context.subscriptions.push(createShowLogsCommand(logger));
}

export function deactivate(): void {
    linter?.dispose();
}