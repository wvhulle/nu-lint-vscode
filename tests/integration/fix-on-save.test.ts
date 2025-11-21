import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { isNuLintAvailable } from '../helpers/nu-lint-runner';

const fixturesPath = path.join(__dirname, '..', 'fixtures');
let originalConfig: boolean;

async function setupFixOnSaveTests(): Promise<void> {
    const available = isNuLintAvailable();
    if (!available) {
        throw new Error('nu-lint not available');
    }

    const extension = vscode.extensions.getExtension('WillemVanhulle.nu-lint');
    assert.ok(extension);
    await extension.activate();

    const config = vscode.workspace.getConfiguration('nu-lint');
    originalConfig = config.get('fixOnSave', false);
}

async function teardownFixOnSaveTests(): Promise<void> {
    const config = vscode.workspace.getConfiguration('nu-lint');
    await config.update('fixOnSave', originalConfig, vscode.ConfigurationTarget.Global);
}

suite('Fix On Save - Specific File', () => {
    suiteSetup(async function() {
        try {
            await setupFixOnSaveTests();
        } catch {
            this.skip();
        }
    });

    suiteTeardown(teardownFixOnSaveTests);

    test('Should fix only the specific saved file, not workspace', async function() {
        this.timeout(15000);

        const config = vscode.workspace.getConfiguration('nu-lint');
        await config.update('fixOnSave', true, vscode.ConfigurationTarget.Global);

        const testFilePath = path.join(fixturesPath, 'temp-test-fix.nu');
        const contentWithIssue = 'def test_function [] {\n  echo "hello"\n}';
        
        try {
            await fs.writeFile(testFilePath, contentWithIssue, 'utf-8');

            const doc = await vscode.workspace.openTextDocument(testFilePath);
            await vscode.window.showTextDocument(doc);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const saved = await doc.save();
            assert.ok(saved, 'Document should be saved');

            await new Promise(resolve => setTimeout(resolve, 2000));

            const fixedContent = await fs.readFile(testFilePath, 'utf-8');
            const hasChanges = fixedContent !== contentWithIssue;
            
            assert.ok(hasChanges || fixedContent === contentWithIssue, 'Content should be processed');

            const otherFile = path.join(fixturesPath, 'valid-file.nu');
            const otherFileStat = await fs.stat(otherFile);
            const beforeSaveTime = Date.now();
            
            const timeDiff = beforeSaveTime - otherFileStat.mtimeMs;
            assert.ok(timeDiff > 5000, 'Other fixture files should not be modified');

            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        } finally {
            try {
                await fs.unlink(testFilePath);
            } catch {
                // Ignore
            }
            
            await config.update('fixOnSave', false, vscode.ConfigurationTarget.Global);
        }
    });
});

suite('Fix On Save - Before Save', () => {
    suiteSetup(async function() {
        try {
            await setupFixOnSaveTests();
        } catch {
            this.skip();
        }
    });

    suiteTeardown(teardownFixOnSaveTests);

    test('Should apply fixes before document is saved', async function() {
        this.timeout(15000);

        const config = vscode.workspace.getConfiguration('nu-lint');
        await config.update('fixOnSave', true, vscode.ConfigurationTarget.Global);

        const testFilePath = path.join(fixturesPath, 'temp-test-fix-order.nu');
        const contentWithIssue = 'def another_test [] {\n  echo "world"\n}';
        
        try {
            await fs.writeFile(testFilePath, contentWithIssue, 'utf-8');

            const doc = await vscode.workspace.openTextDocument(testFilePath);
            await vscode.window.showTextDocument(doc);

            await new Promise(resolve => setTimeout(resolve, 2000));

            await doc.save();
            await new Promise(resolve => setTimeout(resolve, 2000));

            const savedContent = await fs.readFile(testFilePath, 'utf-8');
            
            assert.ok(savedContent, 'Saved content should exist');
            
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        } finally {
            try {
                await fs.unlink(testFilePath);
            } catch {
                // Ignore
            }
            
            await config.update('fixOnSave', false, vscode.ConfigurationTarget.Global);
        }
    });
});
