import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Command Tests', () => {
    let extension: vscode.Extension<any> | undefined;

    suiteSetup(async () => {
        extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();
    });

    test('lintFile command should execute without error on empty document', async function() {
        this.timeout(10000);

        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: ''
        });

        await vscode.window.showTextDocument(doc);

        try {
            await vscode.commands.executeCommand('nu-lint.lintFile');
            assert.ok(true, 'Command executed successfully');
        } catch (error) {
            assert.fail(`Command failed: ${error}`);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('lintFile command should work on nushell document', async function() {
        this.timeout(10000);

        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: 'def test [] { echo "hello" }'
        });

        await vscode.window.showTextDocument(doc);

        try {
            await vscode.commands.executeCommand('nu-lint.lintFile');
            assert.ok(true, 'Command executed successfully');
        } catch (error) {
            assert.fail(`Command failed: ${error}`);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('lintWorkspace command should execute without error', async function() {
        this.timeout(15000);

        try {
            await vscode.commands.executeCommand('nu-lint.lintWorkspace');
            assert.ok(true, 'Command executed successfully');
        } catch (error) {
            assert.fail(`Command failed: ${error}`);
        }
    });

    test('showLogs command should execute without error', async () => {
        try {
            await vscode.commands.executeCommand('nu-lint.showLogs');
            assert.ok(true, 'Command executed successfully');
        } catch (error) {
            assert.fail(`Command failed: ${error}`);
        }
    });

    test('lintFile should not run on non-nushell files', async function() {
        this.timeout(5000);

        const doc = await vscode.workspace.openTextDocument({
            language: 'javascript',
            content: 'console.log("test");'
        });

        await vscode.window.showTextDocument(doc);

        try {
            await vscode.commands.executeCommand('nu-lint.lintFile');
            assert.ok(true, 'Command executed successfully (should be no-op)');
        } catch (error) {
            assert.fail(`Command failed: ${error}`);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
});
