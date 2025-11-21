import * as assert from 'assert';
import { parseNuLintOutput } from '../../src/parsing';

suite('Parsing Tests', () => {
    test('should parse empty output', () => {
        const result = parseNuLintOutput('', 'json');
        assert.strictEqual(result.violations.length, 0);
        assert.strictEqual(result.summary.errors, 0);
        assert.strictEqual(result.summary.warnings, 0);
    });

    test('should parse legacy JSON output with violations', () => {
        const jsonOutput = JSON.stringify({
            violations: [
                {
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    rule_id: 'test-rule',
                    severity: 'error',
                    message: 'Test error',
                    file: 'test.nu',
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    line_start: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    line_end: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    column_start: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    column_end: 10
                }
            ],
            summary: {
                errors: 1,
                warnings: 0,
                info: 0,
                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                files_checked: 1
            }
        });

        const result = parseNuLintOutput(jsonOutput, 'json');
        assert.strictEqual(result.violations.length, 1);
        assert.strictEqual(result.violations[0].rule_id, 'test-rule');
        assert.strictEqual(result.summary.errors, 1);
    });

    test('should parse VSCode JSON output format', () => {
        const jsonOutput = JSON.stringify({
            diagnostics: {
                'test.nu': [
                    {
                        range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 10 }
                        },
                        severity: 1,
                        code: 'test-rule',
                        source: 'nu-lint',
                        message: 'Test error'
                    }
                ]
            },
            summary: {
                errors: 1,
                warnings: 0,
                info: 0,
                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                files_checked: 1
            }
        });

        const result = parseNuLintOutput(jsonOutput, 'vscode-json');
        assert.ok(result.vscodeData);
        assert.strictEqual(Object.keys(result.vscodeData).length, 1);
        assert.strictEqual(result.summary.errors, 1);
    });

    test('should handle malformed JSON gracefully', () => {
        assert.throws(() => {
            parseNuLintOutput('not json', 'json');
        }, SyntaxError);
    });

    test('should handle whitespace-only output', () => {
        const result = parseNuLintOutput('   \n  \t  ', 'json');
        assert.strictEqual(result.violations.length, 0);
        assert.strictEqual(result.summary.errors, 0);
    });

    test('should parse violations with fixes', () => {
        const jsonOutput = JSON.stringify({
            violations: [
                {
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    rule_id: 'fixable-rule',
                    severity: 'warning',
                    message: 'Fixable issue',
                    file: 'test.nu',
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    line_start: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    line_end: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    column_start: 1,
                    /* eslint-disable-next-line @typescript-eslint/naming-convention */
                    column_end: 5,
                    fix: {
                        description: 'Apply fix',
                        replacements: [
                            {
                                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                                offset_start: 0,
                                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                                offset_end: 5,
                                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                                new_text: 'fixed'
                            }
                        ]
                    }
                }
            ],
            summary: {
                errors: 0,
                warnings: 1,
                info: 0,
                /* eslint-disable-next-line @typescript-eslint/naming-convention */
                files_checked: 1
            }
        });

        const result = parseNuLintOutput(jsonOutput, 'json');
        assert.strictEqual(result.violations.length, 1);
        assert.ok(result.violations[0].fix);
        assert.strictEqual(result.violations[0].fix?.description, 'Apply fix');
    });
});
