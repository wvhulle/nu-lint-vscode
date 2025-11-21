import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Code Action Tests', () => {
    let testWorkspaceRoot: string;
    let testFixture: vscode.Uri;

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            testWorkspaceRoot = path.join(__dirname, '..', 'fixtures');
        } else {
            testWorkspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }
    });

    test('Should provide code actions for diagnostics with fixes', async function() {
        this.timeout(10000);

        const testContent = 'def test [] {\n  echo "hello"\n}';
        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: testContent
        });

        const editor = await vscode.window.showTextDocument(doc);
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        
        if (diagnostics.length > 0) {
            const diagnostic = diagnostics[0];
            const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                doc.uri,
                diagnostic.range
            );

            if (codeActions && codeActions.length > 0) {
                const quickFixes = codeActions.filter(
                    action => action.kind && action.kind.value === vscode.CodeActionKind.QuickFix.value
                );

                assert.ok(quickFixes.length > 0, 'Should have quick fix code actions');
                
                const fix = quickFixes[0];
                assert.ok(fix.title.startsWith('Fix:'), 'Code action title should start with "Fix:"');
                assert.ok(fix.edit, 'Code action should have an edit');
            }
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Should not provide code actions for diagnostics without fixes', async function() {
        this.timeout(10000);

        const testContent = 'def test [] {\n  echo "hello"\n}';
        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: testContent
        });

        await vscode.window.showTextDocument(doc);
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        const emptyRange = new vscode.Range(10, 0, 10, 0);
        const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            emptyRange
        );

        const nuLintActions = codeActions?.filter(
            action => action.diagnostics?.some(d => d.source === 'nu-lint')
        ) ?? [];

        assert.strictEqual(nuLintActions.length, 0, 'Should not provide actions for ranges without diagnostics');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
