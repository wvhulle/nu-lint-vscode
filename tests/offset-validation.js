#!/usr/bin/env node

// Validates that nu-lint JSON output offsets correctly map to file positions
// and that suggested fixes target the right text spans
const fs = require('fs');
const { execSync } = require('child_process');

function offsetToPosition(content, offset) {
  const lines = content.substring(0, offset).split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function applyFix(content, replacement) {
  return content.substring(0, replacement.offset_start) +
         replacement.new_text +
         content.substring(replacement.offset_end);
}

function validateOffsets() {
  console.log('Nu-Lint Offset Validation Test');
  console.log('=============================');

  // Read actual file content
  const testFilePath = 'tests/fixtures/test-script.nu';
  const testFileContent = fs.readFileSync(testFilePath, 'utf8');
  console.log(`File: ${testFilePath} (${testFileContent.length} chars, ${testFileContent.split('\n').length} lines)`);

  // Get nu-lint output
  let nuLintOutput;
  try {
    const nuLintJson = execSync(`nu-lint -f json ${testFilePath} 2>&1`, {
      encoding: 'utf8'
    });
    nuLintOutput = JSON.parse(nuLintJson);
  } catch (error) {
    // nu-lint returns non-zero when there are violations, but output is still valid JSON
    if (error.stdout) {
      try {
        nuLintOutput = JSON.parse(error.stdout);
      } catch (parseError) {
        console.error('FAIL: Failed to parse nu-lint JSON output');
        console.error('stdout:', error.stdout);
        process.exit(1);
      }
    } else {
      console.error('FAIL: Failed to run nu-lint');
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  const violations = nuLintOutput.violations || [];
  console.log(`Found ${violations.length} violations to test\n`);

  if (violations.length === 0) {
    console.log('PASS: No violations found - test file may have all issues fixed');
    return true;
  }

  let allPassed = true;

  violations.forEach((violation, index) => {
    console.log(`--- Violation ${index + 1}: ${violation.rule_id} ---`);

    // Test violation position
    const violationText = testFileContent.substring(violation.offset_start, violation.offset_end);
    const violationPos = offsetToPosition(testFileContent, violation.offset_start);

    const lineMatches = (violationPos.line + 1) === violation.line_start;
    const colMatches = (violationPos.character + 1) === violation.column_start;

    console.log(`Violation: "${violationText}" at offset ${violation.offset_start}-${violation.offset_end}`);
    console.log(`Calculated position: (${violationPos.line + 1}, ${violationPos.character + 1})`);
    console.log(`Expected position: (${violation.line_start}, ${violation.column_start})`);
    console.log(`Position check: ${lineMatches ? 'PASS' : 'FAIL'} line, ${colMatches ? 'PASS' : 'FAIL'} column`);

    if (!lineMatches || !colMatches) {
      allPassed = false;
      console.log(`FAIL: POSITION MISMATCH for ${violation.rule_id}`);
    }

    // Test fixes if available
    if (violation.fix && violation.fix.replacements && violation.fix.replacements.length > 0) {
      violation.fix.replacements.forEach((replacement, replIndex) => {
        console.log(`  Fix ${replIndex + 1}: ${violation.fix.description}`);

        const textToReplace = testFileContent.substring(replacement.offset_start, replacement.offset_end);
        const replPos = offsetToPosition(testFileContent, replacement.offset_start);

        console.log(`  Replace: "${textToReplace}" at offset ${replacement.offset_start}-${replacement.offset_end}`);
        console.log(`  With: "${replacement.new_text}"`);
        console.log(`  Fix position: (${replPos.line + 1}, ${replPos.character + 1})`);

        // Verify fix is reasonably close to violation
        const lineDistance = Math.abs(replPos.line - violationPos.line);
        if (lineDistance <= 2) {
          console.log(`  Distance: PASS (${lineDistance} lines away)`);
        } else {
          console.log(`  Distance: FAIL (${lineDistance} lines away - suspicious)`);
          allPassed = false;
        }

        // Show result of applying fix
        try {
          const fixedContent = applyFix(testFileContent, replacement);
          const fixedLines = fixedContent.split('\n');
          const affectedLine = fixedLines[replPos.line];
          console.log(`  Result: "${affectedLine}"`);
        } catch (error) {
          console.log(`  FAIL: Failed to apply fix: ${error.message}`);
          allPassed = false;
        }
      });
    } else {
      console.log(`  No fix available for ${violation.rule_id}`);
    }

    console.log('');
  });

  return allPassed;
}

// Run validation
const success = validateOffsets();

console.log('=== FINAL RESULT ===');
if (success) {
  console.log('ALL OFFSET VALIDATIONS PASSED');
  console.log('Nu-lint offsets are working correctly!');
  process.exit(0);
} else {
  console.log('SOME VALIDATIONS FAILED');
  console.log('There are offset calculation issues that need fixing.');
  process.exit(1);
}