import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { isNuLintAvailable } from '../helpers/nu-lint-runner';

suite('End-to-End Linting Flow - Basic', () => {
    const nuLintAvailable = isNuLintAvailable();

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension, 'Extension should be installed');
        await extension.activate();
        assert.ok(extension.isActive, 'Extension should be activated');
    });

    test('Should lint file and show diagnostics', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        this.timeout(15000);

        const fixturePath = path.join(__dirname, '..', 'fixtures', 'file-with-issues.nu');
        const fixtureUri = vscode.Uri.file(fixturePath);

        const doc = await vscode.workspace.openTextDocument(fixtureUri);
        await vscode.window.showTextDocument(doc);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        assert.ok(diagnostics.length > 0, 'Should have diagnostics after opening file');

        const kebabCaseDiag = diagnostics.find(d => d.code === 'kebab_case_commands');
        if (kebabCaseDiag !== undefined) {
            const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                doc.uri,
                kebabCaseDiag.range
            );

            assert.ok(codeActions, 'Should have code actions');
            const quickFixes = codeActions.filter(
                action => action.kind !== undefined && action.kind.value === vscode.CodeActionKind.QuickFix.value
            );

            assert.ok(quickFixes.length > 0, 'Should have at least one quick fix');
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});

suite('End-to-End Linting Flow - Commands', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('Should handle workspace linting command', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        this.timeout(15000);

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('nu-lint.lintWorkspace'), 'Workspace lint command should be registered');
    });

    test('Should handle file linting command', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        this.timeout(15000);

        const fixturePath = path.join(__dirname, '..', 'fixtures', 'file-with-issues.nu');
        const fixtureUri = vscode.Uri.file(fixturePath);

        const doc = await vscode.workspace.openTextDocument(fixtureUri);
        await vscode.window.showTextDocument(doc);

        await vscode.commands.executeCommand('nu-lint.lintFile');

        await new Promise(resolve => setTimeout(resolve, 2000));

        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        assert.ok(diagnostics.length > 0, 'Should have diagnostics after explicit lint command');

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});

suite('End-to-End Linting Flow - Lifecycle', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('Should clear diagnostics when document is closed', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        this.timeout(15000);

        const testContent = 'def test_func [] { echo "test" }';
        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: testContent
        });

        await vscode.window.showTextDocument(doc);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const diagnosticsBeforeClose = vscode.languages.getDiagnostics(doc.uri);

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await new Promise(resolve => setTimeout(resolve, 500));

        const diagnosticsAfterClose = vscode.languages.getDiagnostics(doc.uri);
        const isCleared = diagnosticsAfterClose.length === 0 || diagnosticsAfterClose.length < diagnosticsBeforeClose.length;
        assert.ok(isCleared, 'Diagnostics should be cleared or reduced after closing document');
    });
});
