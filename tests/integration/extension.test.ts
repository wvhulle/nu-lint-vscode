import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Extension Activation Tests', () => {
    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension, 'Extension should be installed');
    });

    test('Extension should activate', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        
        await extension.activate();
        assert.strictEqual(extension.isActive, true, 'Extension should be activated');
    });

    test('Should register nu-lint.lintFile command', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('nu-lint.lintFile'), 'lintFile command should be registered');
    });

    test('Should register nu-lint.lintWorkspace command', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('nu-lint.lintWorkspace'), 'lintWorkspace command should be registered');
    });

    test('Should register nu-lint.showLogs command', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('nu-lint.showLogs'), 'showLogs command should be registered');
    });

    test('Should register code action provider for nushell language', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        const doc = await vscode.workspace.openTextDocument({
            language: 'nushell',
            content: 'def test [] { echo "hello" }'
        });

        const codeActionProviders = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            new vscode.Range(0, 0, 0, 10)
        );

        assert.ok(Array.isArray(codeActionProviders), 'Code action providers should be available');
    });

    test('Should register code action provider for nu language', async () => {
        const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
        assert.ok(extension);
        await extension.activate();

        const doc = await vscode.workspace.openTextDocument({
            language: 'nu',
            content: 'def test [] { echo "hello" }'
        });

        const codeActionProviders = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            doc.uri,
            new vscode.Range(0, 0, 0, 10)
        );

        assert.ok(Array.isArray(codeActionProviders), 'Code action providers should be available');
    });
});
