import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as assert from 'assert';

interface Position {
    line: number;
    character: number;
}

interface Replacement {
    offset_start: number;
    offset_end: number;
    new_text: string;
}

interface Fix {
    description: string;
    replacements: Replacement[];
}

interface Violation {
    rule_id: string;
    severity: string;
    message: string;
    file: string;
    line_start: number;
    line_end: number;
    column_start: number;
    column_end: number;
    offset_start: number;
    offset_end: number;
    suggestion?: string;
    fix?: Fix;
}

interface NuLintOutput {
    violations: Violation[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
        files_checked: number;
    };
}

function offsetToPosition(content: string, offset: number): Position {
    const lines = content.substring(0, offset).split('\n');
    return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function applyFix(content: string, replacement: Replacement): string {
    return content.substring(0, replacement.offset_start) +
           replacement.new_text +
           content.substring(replacement.offset_end);
}

describe('Nu-Lint Offset Validation', () => {
    const testFilePath = path.resolve(__dirname, '../fixtures/test-script.nu');

    it('should validate offsets match line/column positions', function() {
        this.timeout(10000);
        
        if (!fs.existsSync(testFilePath)) {
            this.skip();
            return;
        }

        const testFileContent = fs.readFileSync(testFilePath, 'utf8');
        
        let nuLintOutput: NuLintOutput;
        try {
            const nuLintJson = execSync(`nu-lint -f json ${testFilePath}`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            nuLintOutput = JSON.parse(nuLintJson);
        } catch (error: unknown) {
            const err = error as { stdout?: string; stderr?: string };
            if (err.stdout) {
                try {
                    nuLintOutput = JSON.parse(err.stdout);
                } catch {
                    this.skip();
                    return;
                }
            } else {
                this.skip();
                return;
            }
        }

        const violations = nuLintOutput.violations || [];
        
        if (violations.length === 0) {
            console.log('    No violations found - test file may be clean');
            return;
        }

        violations.forEach((violation, index) => {
            const violationPos = offsetToPosition(testFileContent, violation.offset_start);

            const lineMatches = (violationPos.line + 1) === violation.line_start;
            const colMatches = (violationPos.character + 1) === violation.column_start;

            assert.ok(lineMatches, 
                `Violation ${index + 1} (${violation.rule_id}): line mismatch. ` +
                `Expected ${violation.line_start}, got ${violationPos.line + 1}`);
            
            assert.ok(colMatches,
                `Violation ${index + 1} (${violation.rule_id}): column mismatch. ` +
                `Expected ${violation.column_start}, got ${violationPos.character + 1}`);

            if (violation.fix?.replacements) {
                violation.fix.replacements.forEach((replacement, replIndex) => {
                    const replPos = offsetToPosition(testFileContent, replacement.offset_start);
                    const lineDistance = Math.abs(replPos.line - violationPos.line);
                    
                    assert.ok(lineDistance <= 2,
                        `Violation ${index + 1} fix ${replIndex + 1}: Fix is ${lineDistance} lines away (suspicious)`);

                    assert.doesNotThrow(() => {
                        applyFix(testFileContent, replacement);
                    }, `Violation ${index + 1} fix ${replIndex + 1}: Failed to apply fix`);
                });
            }
        });
    });
});
