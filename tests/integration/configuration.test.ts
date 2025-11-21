import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Configuration Tests', () => {
    let originalConfig: any;

    suiteSetup(() => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        originalConfig = {
            enable: config.get('enable'),
            executablePath: config.get('executablePath'),
            configPath: config.get('configPath'),
            lintOnSave: config.get('lintOnSave'),
            lintOnOpen: config.get('lintOnOpen'),
            lintOnType: config.get('lintOnType')
        };
    });

    suiteTeardown(async () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        for (const [key, value] of Object.entries(originalConfig)) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
    });

    test('Should read enable setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const enable = config.get<boolean>('enable');
        assert.strictEqual(typeof enable, 'boolean');
    });

    test('Should read executablePath setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const executablePath = config.get<string>('executablePath');
        assert.strictEqual(typeof executablePath, 'string');
    });

    test('Should read configPath setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const configPath = config.get<string>('configPath');
        assert.strictEqual(typeof configPath, 'string');
    });

    test('Should read lintOnSave setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const lintOnSave = config.get<boolean>('lintOnSave');
        assert.strictEqual(typeof lintOnSave, 'boolean');
    });

    test('Should read lintOnOpen setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const lintOnOpen = config.get<boolean>('lintOnOpen');
        assert.strictEqual(typeof lintOnOpen, 'boolean');
    });

    test('Should read lintOnType setting', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const lintOnType = config.get<boolean>('lintOnType');
        assert.strictEqual(typeof lintOnType, 'boolean');
    });

    test('Should update enable setting', async () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        await config.update('enable', false, vscode.ConfigurationTarget.Global);
        
        const updatedValue = config.get<boolean>('enable');
        assert.strictEqual(updatedValue, false);

        await config.update('enable', true, vscode.ConfigurationTarget.Global);
    });

    test('Should update executablePath setting', async () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        const testPath = '/custom/path/to/nu-lint';
        
        await config.update('executablePath', testPath, vscode.ConfigurationTarget.Global);
        
        const updatedValue = config.get<string>('executablePath');
        assert.strictEqual(updatedValue, testPath);

        await config.update('executablePath', 'nu-lint', vscode.ConfigurationTarget.Global);
    });

    test('Should have correct default values', () => {
        const config = vscode.workspace.getConfiguration('nu-lint');
        
        const defaults = {
            enable: config.inspect<boolean>('enable')?.defaultValue,
            executablePath: config.inspect<string>('executablePath')?.defaultValue,
            lintOnSave: config.inspect<boolean>('lintOnSave')?.defaultValue,
            lintOnOpen: config.inspect<boolean>('lintOnOpen')?.defaultValue,
            lintOnType: config.inspect<boolean>('lintOnType')?.defaultValue
        };

        assert.strictEqual(defaults.enable, true);
        assert.strictEqual(defaults.executablePath, 'nu-lint');
        assert.strictEqual(defaults.lintOnSave, true);
        assert.strictEqual(defaults.lintOnOpen, true);
        assert.strictEqual(defaults.lintOnType, false);
    });
});
