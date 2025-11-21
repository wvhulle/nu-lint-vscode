import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig } from '../../src/config';

suite('Config Tests', () => {
    test('should return default config values', () => {
        const config = getConfig();
        
        assert.ok(typeof config.enable === 'boolean');
        assert.ok(typeof config.executablePath === 'string');
        assert.ok(typeof config.configPath === 'string');
        assert.ok(typeof config.lintOnSave === 'boolean');
        assert.ok(typeof config.lintOnOpen === 'boolean');
        assert.ok(typeof config.lintOnType === 'boolean');
    });

    test('should have reasonable defaults', () => {
        const config = getConfig();
        
        assert.strictEqual(config.enable, true);
        assert.strictEqual(config.executablePath, 'nu-lint');
        assert.strictEqual(config.lintOnSave, true);
        assert.strictEqual(config.lintOnOpen, true);
        assert.strictEqual(config.lintOnType, false);
    });
});
