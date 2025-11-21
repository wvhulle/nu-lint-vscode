import * as assert from 'assert';
import { parseNuLintOutput } from '../../src/parsing';
import { runNuLintOnFixture, isNuLintAvailable } from '../helpers/nu-lint-runner';

suite('Parsing Tests - Edge Cases', () => {
    test('should parse empty output', () => {
        const result = parseNuLintOutput('', 'json');
        assert.strictEqual(result.violations.length, 0);
        assert.strictEqual(result.summary.errors, 0);
        assert.strictEqual(result.summary.warnings, 0);
    });

    test('should handle whitespace-only output', () => {
        const result = parseNuLintOutput('   \n  \t  ', 'json');
        assert.strictEqual(result.violations.length, 0);
        assert.strictEqual(result.summary.errors, 0);
    });

    test('should handle malformed JSON gracefully', () => {
        assert.throws(() => {
            parseNuLintOutput('not json', 'json');
        }, SyntaxError);
    });
});

suite('Parsing Tests - Basic Output', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('should parse actual VSCode JSON output from nu-lint', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        const parsed = parseNuLintOutput(result.stdout, 'vscode-json');

        assert.ok(parsed.vscodeData, 'Should have vscodeData');
        assert.ok(parsed.vscodeData['tests/fixtures/file-with-issues.nu'], 'Should have diagnostics for file');
        assert.ok(parsed.vscodeData['tests/fixtures/file-with-issues.nu'].length > 0, 'Should have at least one diagnostic');
        assert.strictEqual(parsed.summary.warnings, 4, 'Should have 4 warnings');
        assert.strictEqual(parsed.violations.length, 0, 'VSCode format should not populate violations array');
    });

    test('should parse multiple diagnostics for same file', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('test-script.nu', { format: 'vscode-json' });
        const parsed = parseNuLintOutput(result.stdout, 'vscode-json');

        assert.ok(parsed.vscodeData);
        const diagnostics = parsed.vscodeData['tests/fixtures/test-script.nu'];
        assert.ok(diagnostics);
        assert.ok(diagnostics.length > 5, 'test-script.nu should have multiple diagnostics');

        const codes = new Set(diagnostics.map(d => d.code));
        assert.ok(codes.has('typed_pipeline_io'), 'Should have typed_pipeline_io diagnostic');
        assert.ok(codes.has('prefer_builtin_echo'), 'Should have prefer_builtin_echo diagnostic');
    });
});

suite('Parsing Tests - Code Actions', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('should parse diagnostics with code actions', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        const parsed = parseNuLintOutput(result.stdout, 'vscode-json');

        assert.ok(parsed.vscodeData);
        const diagnostics = parsed.vscodeData['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const diagnosticWithAction = diagnostics.find(d => d.code_action !== undefined);
        assert.ok(diagnosticWithAction, 'Should have at least one diagnostic with code action');
        assert.ok(diagnosticWithAction.code_action);
        assert.ok(diagnosticWithAction.code_action.title, 'Code action should have title');
        assert.ok(diagnosticWithAction.code_action.edits.length > 0, 'Code action should have edits');
    });
});

suite('Parsing Tests - Diagnostic Details', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('should correctly parse diagnostic ranges', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        const parsed = parseNuLintOutput(result.stdout, 'vscode-json');

        assert.ok(parsed.vscodeData);
        const diagnostics = parsed.vscodeData['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const kebabCaseDiag = diagnostics.find(d => d.code === 'kebab_case_commands');
        assert.ok(kebabCaseDiag, 'Should find kebab_case_commands diagnostic');
        assert.strictEqual(kebabCaseDiag.range.start.line, 0, 'Should start at line 0');
        assert.strictEqual(kebabCaseDiag.range.start.character, 4, 'Should start at character 4');
        assert.ok(kebabCaseDiag.message.includes('test_with_issues'), 'Message should mention the function name');
    });

    test('should parse related information', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        const parsed = parseNuLintOutput(result.stdout, 'vscode-json');

        assert.ok(parsed.vscodeData);
        const diagnostics = parsed.vscodeData['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const diagWithRelated = diagnostics.find(d => d.related_information !== undefined && d.related_information.length > 0);
        assert.ok(diagWithRelated, 'Should have diagnostic with related information');
        assert.ok(diagWithRelated.related_information);
        assert.ok(diagWithRelated.related_information[0].message.length > 0, 'Related info should have message');
    });
});
