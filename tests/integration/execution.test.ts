import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { execNuLint, createNuLintCommand, detectNuLintFormat, getNuLintVersion } from '../../src/execution';
import { isNuLintAvailable } from '../helpers/nu-lint-runner';

suite('Execution Module Tests', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('getNuLintVersion should return version string', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const version = await getNuLintVersion('nu-lint');
        assert.ok(version, 'Should return a version');
        assert.match(version, /^\d+\.\d+\.\d+$/, 'Version should match semver pattern');
    });

    test('detectNuLintFormat should detect vscode-json for version 0.0.37+', () => {
        assert.strictEqual(detectNuLintFormat('0.0.37'), 'vscode-json');
        assert.strictEqual(detectNuLintFormat('0.0.44'), 'vscode-json');
        assert.strictEqual(detectNuLintFormat('1.0.0'), 'vscode-json');
    });

    test('detectNuLintFormat should detect json for older versions', () => {
        assert.strictEqual(detectNuLintFormat('0.0.36'), 'json');
        assert.strictEqual(detectNuLintFormat('0.0.20'), 'json');
    });

    test('detectNuLintFormat should default to json for null version', () => {
        assert.strictEqual(detectNuLintFormat(null), 'json');
    });
});

suite('Execution Module - Command Creation', () => {
    test('createNuLintCommand should create proper command structure', () => {
        const fixturePath = path.join(__dirname, '..', 'fixtures', 'file-with-issues.nu');
        const workspaceRoot = path.join(__dirname, '..', 'fixtures');

        const result = createNuLintCommand({
            filePath: fixturePath,
            format: 'vscode-json',
            workspaceRoot
        });

        assert.strictEqual(result.executable, 'nu-lint', 'Should use default executable');
        assert.ok(result.args.includes('-f'), 'Should include format flag');
        assert.ok(result.args.includes('vscode-json'), 'Should include vscode-json format');
        assert.strictEqual(result.cwd, workspaceRoot, 'Should use workspace root as cwd');
    });

    test('createNuLintCommand should include config path when provided', () => {
        const fixturePath = path.join(__dirname, '..', 'fixtures', 'file-with-issues.nu');

        const result = createNuLintCommand({
            filePath: fixturePath,
            format: 'json',
            configPath: '/path/to/config.toml'
        });

        assert.ok(result.args.includes('--config'), 'Should include config flag');
        assert.ok(result.args.includes('/path/to/config.toml'), 'Should include config path');
    });
});

suite('Execution Module - Basic Execution', () => {
    const nuLintAvailable = isNuLintAvailable();
    const logger = vscode.window.createOutputChannel('Nu-Lint Tests', { log: true });

    test('execNuLint should execute on fixture file', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const fixturePath = path.join(__dirname, '..', 'fixtures', 'file-with-issues.nu');

        const testLogger = vscode.window.createOutputChannel('Nu-Lint Tests', { log: true });
        const output = await execNuLint({
            filePath: fixturePath,
            format: 'vscode-json'
        }, testLogger);

        assert.ok(output, 'Should return output');
        assert.ok(output.length > 0, 'Output should not be empty');

        const parsed = JSON.parse(output) as import('../../src/parsing').VSCodeLintOutput;
        assert.ok(parsed.diagnostics, 'Should have diagnostics field');
        assert.ok(parsed.summary, 'Should have summary field');
    });

    test('execNuLint should handle file with no issues', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const fixturePath = path.join(__dirname, '..', 'fixtures', 'valid-file.nu');

        const output = await execNuLint({
            filePath: fixturePath,
            format: 'vscode-json'
        }, logger);

        assert.ok(output, 'Should return output');
        const parsed = JSON.parse(output) as import('../../src/parsing').VSCodeLintOutput;
        assert.ok(parsed.diagnostics, 'Should have diagnostics field');
    });
});

suite('Execution Module - Path Handling', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('execNuLint should work with relative paths', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const logger = vscode.window.createOutputChannel('Nu-Lint Tests', { log: true });
        const fixturePath = path.join(__dirname, '..', 'fixtures', 'test-script.nu');
        const workspaceRoot = path.join(__dirname, '..', 'fixtures');

        const output = await execNuLint({
            filePath: fixturePath,
            format: 'vscode-json',
            workspaceRoot
        }, logger);

        assert.ok(output, 'Should return output');
        const parsed = JSON.parse(output) as import('../../src/parsing').VSCodeLintOutput;
        assert.ok(parsed.diagnostics, 'Should have diagnostics field');
    });
});
