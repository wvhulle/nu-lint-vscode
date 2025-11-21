import * as assert from 'assert';
import * as vscode from 'vscode';
import { runNuLintOnFixture, isNuLintAvailable } from '../helpers/nu-lint-runner';

suite('Code Action Tests - Extension', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();
    });

    test('Should provide code actions for diagnostics with fixes', async function() {
        this.timeout(10000);

        const testContent = 'def test [] {\n  echo "hello"\n}';
        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: testContent
        });

        await vscode.window.showTextDocument(doc);
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        
        if (diagnostics.length > 0) {
            const [diagnostic] = diagnostics;
            const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                doc.uri,
                diagnostic.range
            );

            if (codeActions !== undefined && codeActions.length > 0) {
                const quickFixes = codeActions.filter(
                    action => action.kind !== undefined && action.kind.value === vscode.CodeActionKind.QuickFix.value
                );

                assert.ok(quickFixes.length > 0, 'Should have quick fix code actions');
                
                const [fix] = quickFixes;
                assert.ok(fix.title.startsWith('Fix:'), 'Code action title should start with "Fix:"');
                assert.ok(fix.edit, 'Code action should have an edit');
            }
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});

suite('Code Action Tests - Empty Ranges', () => {
    test('Should not provide code actions for empty ranges', async function() {
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

suite('Code Action Tests - Actual nu-lint', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('Should find code actions from actual nu-lint output', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        assert.ok(result.parsed);

        const diagnostics = result.parsed.diagnostics['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const diagsWithActions = diagnostics.filter(d => d.code_action !== undefined);
        assert.ok(diagsWithActions.length > 0, 'Should have diagnostics with code actions');

        const [firstDiagWithAction] = diagsWithActions;
        assert.ok(firstDiagWithAction.code_action, 'Should have code action');
        assert.ok(firstDiagWithAction.code_action.title.length > 0, 'Code action should have title');
        assert.ok(firstDiagWithAction.code_action.edits.length > 0, 'Code action should have edits');
    });

    test('Should have correct replacement text in code actions', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        assert.ok(result.parsed);

        const diagnostics = result.parsed.diagnostics['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const kebabCaseDiag = diagnostics.find(d => d.code === 'kebab_case_commands');
        assert.ok(kebabCaseDiag, 'Should find kebab_case_commands diagnostic');
        assert.ok(kebabCaseDiag.code_action, 'Diagnostic should have code action');

        const [edit] = kebabCaseDiag.code_action.edits;
        assert.ok(edit, 'Should have at least one edit');
        assert.strictEqual(edit.replacement_text, 'test-with-issues', 'Should suggest kebab-case name');
    });
});
