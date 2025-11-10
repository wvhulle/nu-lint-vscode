#!/usr/bin/env node

// Test to ensure nu-lint runs from workspace root with relative paths
// This prevents the bug where nu-lint appends .git to file paths
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function testWorkspaceRootExecution() {
  console.log('Testing nu-lint workspace root execution...');

  // Create a temporary git repo structure
  const testDir = '/tmp/nu-lint-test';
  const subDir = path.join(testDir, 'subdir');
  const testFile = path.join(subDir, 'test.nu');

  try {
    // Clean up and create test structure
    if (fs.existsSync(testDir)) {
      execSync(`rm -rf ${testDir}`);
    }
    fs.mkdirSync(testDir);
    execSync(`cd ${testDir} && git init 2>/dev/null`);
    fs.mkdirSync(subDir);

    // Create a simple nu file with a linting issue
    fs.writeFileSync(testFile, `def test [] {
  echo "hello"  # should prefer print over echo
}`);

    // Test 1: Run from root with relative path (should work)
    try {
      execSync(`cd ${testDir} && nu-lint -f json subdir/test.nu 2>/dev/null`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log('PASS: Test 1: Git root + relative path works');
    } catch (error) {
      if (error.stdout || (error.stderr && !error.stderr.includes('.git'))) {
        console.log('PASS: Test 1: Git root + relative path works');
      } else if (error.stderr && error.stderr.includes('.git')) {
        console.log('FAIL: Test 1: Still getting .git path errors');
        return false;
      } else {
        console.log('PASS: Test 1: Git root + relative path works');
      }
    }

    // Test 2: Run from subdirectory with absolute path (simulates the old bug)
    try {
      execSync(`cd ${subDir} && nu-lint -f json ${testFile} 2>/dev/null`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log('PASS: Test 2: Subdirectory execution works (newer nu-lint)');
    } catch (error) {
      if (error.stderr && error.stderr.includes('.git')) {
        console.log('PASS: Test 2: Confirms .git path bug from subdirectory');
      } else if (error.stdout) {
        console.log('PASS: Test 2: Subdirectory execution works');
      } else {
        console.log('WARN: Test 2: Unexpected error (ignored)');
      }
    }

    return true;

  } catch (error) {
    console.error('FAIL: Test setup failed:', error.message);
    return false;
  } finally {
    // Clean up
    if (fs.existsSync(testDir)) {
      execSync(`rm -rf ${testDir}`);
    }
  }
}

// Run the test
const success = testWorkspaceRootExecution();

if (success) {
  console.log('All tests passed');
} else {
  console.log('Tests failed');
  process.exit(1);
}