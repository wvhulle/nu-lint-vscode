import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { 
    mapSeverityToVSCode, 
    mapVSCodeSeverityToVSCode,
    createLegacyDiagnostic,
    createVSCodeDiagnostic,
    resolveViolationPath 
} from '../../src/diagnostics';
import { LegacyNuLintViolation } from '../../src/legacy';
import { runNuLintOnFixture, isNuLintAvailable, getDiagnosticByCode } from '../helpers/nu-lint-runner';

suite('Diagnostics Tests - Severity Mapping', () => {
    test('should map "error" severity to VSCode Error', () => {
        const severity = mapSeverityToVSCode('error');
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Error);
    });

    test('should map "warning" severity to VSCode Warning', () => {
        const severity = mapSeverityToVSCode('warning');
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Warning);
    });

    test('should map "info" severity to VSCode Information', () => {
        const severity = mapSeverityToVSCode('info');
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Information);
    });

    test('should default unknown severity to Warning', () => {
        const severity = mapSeverityToVSCode('unknown');
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Warning);
    });

    test('should map VSCode severity 1 to Error', () => {
        const severity = mapVSCodeSeverityToVSCode(1);
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Error);
    });

    test('should map VSCode severity 2 to Warning', () => {
        const severity = mapVSCodeSeverityToVSCode(2);
        assert.strictEqual(severity, vscode.DiagnosticSeverity.Warning);
    });

    test('should map VSCode severity 3 and 4 to Information', () => {
        assert.strictEqual(mapVSCodeSeverityToVSCode(3), vscode.DiagnosticSeverity.Information);
        assert.strictEqual(mapVSCodeSeverityToVSCode(4), vscode.DiagnosticSeverity.Information);
    });
});

suite('Diagnostics Tests - Legacy Format', () => {
    test('should create legacy diagnostic with correct range', () => {
        const violation: LegacyNuLintViolation = {
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            rule_id: 'test-rule',
            severity: 'error',
            message: 'Test message',
            file: 'test.nu',
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            line_start: 1,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            line_end: 1,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            column_start: 5,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            column_end: 10,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            offset_start: 4,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            offset_end: 9
        };

        const uri = vscode.Uri.file('/test/test.nu');
        const diagnostic = createLegacyDiagnostic(violation, uri);

        assert.strictEqual(diagnostic.range.start.line, 0);
        assert.strictEqual(diagnostic.range.start.character, 4);
        assert.strictEqual(diagnostic.range.end.line, 0);
        assert.strictEqual(diagnostic.range.end.character, 9);
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
        assert.strictEqual(diagnostic.code, 'test-rule');
        assert.strictEqual(diagnostic.source, 'nu-lint');
    });

    test('should include suggestion in related information', () => {
        const violation: LegacyNuLintViolation = {
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            rule_id: 'test-rule',
            severity: 'warning',
            message: 'Test message',
            file: 'test.nu',
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            line_start: 1,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            line_end: 1,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            column_start: 1,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            column_end: 5,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            offset_start: 0,
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            offset_end: 4,
            suggestion: 'Try this instead'
        };

        const uri = vscode.Uri.file('/test/test.nu');
        const diagnostic = createLegacyDiagnostic(violation, uri);

        assert.ok(diagnostic.relatedInformation);
        assert.strictEqual(diagnostic.relatedInformation.length, 1);
        assert.strictEqual(diagnostic.relatedInformation[0].message, 'Try this instead');
    });
});

suite('Diagnostics Tests - Path Resolution', () => {
    test('should resolve absolute paths correctly', () => {
        const absolutePath = '/home/user/project/test.nu';
        const resolved = resolveViolationPath(absolutePath);
        assert.strictEqual(resolved, absolutePath);
    });

    test('should resolve relative paths with workspace root', () => {
        const relativePath = 'src/test.nu';
        const workspaceRoot = '/home/user/project';
        const resolved = resolveViolationPath(relativePath, workspaceRoot);
        assert.ok(resolved.includes('src/test.nu'));
    });
});

suite('Diagnostics Tests - Actual Output', () => {
    const nuLintAvailable = isNuLintAvailable();

    test('should create diagnostics from actual nu-lint output', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        assert.ok(result.parsed, 'Should have parsed output');

        const diagnostics = result.parsed.diagnostics['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics, 'Should have diagnostics for file');
        assert.ok(diagnostics.length > 0, 'Should have at least one diagnostic');

        const workspaceRoot = path.join(__dirname, '..', 'fixtures');
        const vscodeDiag = createVSCodeDiagnostic(diagnostics[0], workspaceRoot);

        assert.ok(vscodeDiag.range, 'Diagnostic should have range');
        assert.strictEqual(vscodeDiag.source, 'nu-lint', 'Source should be nu-lint');
        assert.ok(vscodeDiag.message.length > 0, 'Should have message');
    });

    test('should correctly map diagnostic severity', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        assert.ok(result.parsed);

        const diagnostics = result.parsed.diagnostics['tests/fixtures/file-with-issues.nu'];
        assert.ok(diagnostics);

        const workspaceRoot = path.join(__dirname, '..', 'fixtures');
        const vscodeDiag = createVSCodeDiagnostic(diagnostics[0], workspaceRoot);

        assert.ok(vscodeDiag.severity === vscode.DiagnosticSeverity.Warning || vscodeDiag.severity === vscode.DiagnosticSeverity.Error);
    });

    test('should handle related information from actual output', async function() {
        if (!nuLintAvailable) {
            this.skip();
            return;
        }

        const result = await runNuLintOnFixture('file-with-issues.nu', { format: 'vscode-json' });
        assert.ok(result.parsed);

        const diagnostic = getDiagnosticByCode(result.parsed, 'tests/fixtures/file-with-issues.nu', 'kebab_case_commands');
        assert.ok(diagnostic, 'Should find kebab_case_commands diagnostic');
        assert.ok(diagnostic.related_information, 'Should have related information');
        assert.ok(diagnostic.related_information.length > 0, 'Related information should not be empty');
    });
});
