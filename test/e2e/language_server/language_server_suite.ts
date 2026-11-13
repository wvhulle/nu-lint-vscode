import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { MINIMUM_VERSION_WITH_LOG_FLAGS } from '../../../src/server_arguments.ts';
import { isVersionAtLeast, probeServerVersion } from '../../../src/server_version_check.ts';
import { resolveUserConfigFile } from '../../../src/user_config_location.ts';

const EXTENSION_IDENTIFIER = 'WillemVanhulle.nu-lint';
const DIAGNOSTIC_DEADLINE_MILLISECONDS = 30_000;
const SNAKE_CASE_RULE = 'snake_case_variables';
const REDUNDANT_ECHO_RULE = 'redundant_echo';
const LEGACY_SCRIPT_NAME = 'legacy_nu_lint.sh';

function diagnosticRuleCode(diagnostic: vscode.Diagnostic): string | undefined {
    const diagnosticCode = diagnostic.code;
    if (typeof diagnosticCode === 'object') {
        return String(diagnosticCode.value);
    }
    return diagnosticCode === undefined ? undefined : String(diagnosticCode);
}

function nuLintRuleCodes(documentUri: vscode.Uri): string[] {
    return vscode.languages
        .getDiagnostics(documentUri)
        .filter((diagnostic) => diagnostic.source === 'nu-lint')
        .flatMap((diagnostic) => diagnosticRuleCode(diagnostic) ?? []);
}

function waitForRuleCodes(
    documentUri: vscode.Uri,
    expectationLabel: string,
    isSatisfied: (ruleCodes: string[]) => boolean,
): Promise<string[]> {
    return new Promise((resolveWait, rejectWait) => {
        const checkRuleCodes = (): boolean => {
            const ruleCodes = nuLintRuleCodes(documentUri);
            if (isSatisfied(ruleCodes)) {
                diagnosticsSubscription.dispose();
                clearTimeout(deadlineTimer);
                resolveWait(ruleCodes);
                return true;
            }
            return false;
        };
        const diagnosticsSubscription = vscode.languages.onDidChangeDiagnostics(() => {
            checkRuleCodes();
        });
        const deadlineTimer = setTimeout(() => {
            diagnosticsSubscription.dispose();
            rejectWait(
                new Error(
                    `Timed out waiting for ${expectationLabel}; last rule codes: ${JSON.stringify(nuLintRuleCodes(documentUri))}`,
                ),
            );
        }, DIAGNOSTIC_DEADLINE_MILLISECONDS);
        checkRuleCodes();
    });
}

function findRuleDiagnostic(documentUri: vscode.Uri, ruleCode: string): vscode.Diagnostic {
    const ruleDiagnostic = vscode.languages
        .getDiagnostics(documentUri)
        .find((diagnostic) => diagnosticRuleCode(diagnostic) === ruleCode);
    assert.ok(ruleDiagnostic, `expected a ${ruleCode} diagnostic`);
    return ruleDiagnostic;
}

function hoverMarkdownText(hovers: vscode.Hover[]): string {
    return hovers
        .flatMap((hover) => hover.contents)
        .map((hoverContent) => (hoverContent instanceof vscode.MarkdownString ? hoverContent.value : JSON.stringify(hoverContent)))
        .join('\n');
}

async function waitForFileContaining(filePath: string, expectedText: string): Promise<void> {
    const deadline = Date.now() + DIAGNOSTIC_DEADLINE_MILLISECONDS;
    while (Date.now() < deadline) {
        const currentText = await readFile(filePath, 'utf8').catch(() => '');
        if (currentText.includes(expectedText)) {
            return;
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
    }
    assert.fail(`Timed out waiting for '${expectedText}' in ${filePath}`);
}

async function installedServerSupportsLogFlags(): Promise<boolean> {
    const versionProbe = await probeServerVersion(
        vscode.workspace.getConfiguration('nu-lint').get<string>('executablePath', 'nu-lint'),
    );
    return versionProbe.outcome === 'current' && isVersionAtLeast(versionProbe.installedVersion, MINIMUM_VERSION_WITH_LOG_FLAGS);
}

function locateFixtureScript(): vscode.Uri {
    const fixtureWorkspace = vscode.workspace.workspaceFolders?.[0];
    assert.ok(fixtureWorkspace, 'the fixture workspace must be opened');
    return vscode.Uri.joinPath(fixtureWorkspace.uri, 'script_with_violations.nu');
}

function locateUserConfigFile(): string {
    const userConfigFile = resolveUserConfigFile({
        platform: process.platform,
        homeDirectory: homedir(),
        environmentVariables: process.env,
    });
    assert.ok(userConfigFile, 'the user config location must be resolvable');
    return userConfigFile;
}

export function registerLanguageServerSuite(): void {
    suite('nu-lint language server', () => {
        const fixtureScript = locateFixtureScript();
        const userConfigFile = locateUserConfigFile();
        let preservedUserConfig: string | undefined;

        suiteSetup(async () => {
            preservedUserConfig = await readFile(userConfigFile, 'utf8').catch(() => undefined);
            await rm(userConfigFile, { force: true });
            await mkdir(dirname(userConfigFile), { recursive: true });
            const extensionUnderTest = vscode.extensions.getExtension(EXTENSION_IDENTIFIER);
            assert.ok(extensionUnderTest, `${EXTENSION_IDENTIFIER} must be loaded`);
            const fixtureDocument = await vscode.workspace.openTextDocument(fixtureScript);
            await vscode.window.showTextDocument(fixtureDocument);
            await extensionUnderTest.activate();
        });

        suiteTeardown(async () => {
            await (preservedUserConfig === undefined
                ? rm(userConfigFile, { force: true })
                : writeFile(userConfigFile, preservedUserConfig));
        });

        test('publishes diagnostics with rule codes', async () => {
            const ruleCodes = await waitForRuleCodes(
                fixtureScript,
                'snake_case and redundant echo diagnostics',
                (currentCodes) => currentCodes.includes(SNAKE_CASE_RULE) && currentCodes.includes(REDUNDANT_ECHO_RULE),
            );
            assert.ok(ruleCodes.length >= 2);
        });

        test('shows rule documentation on hover', async () => {
            const snakeCaseDiagnostic = findRuleDiagnostic(fixtureScript, SNAKE_CASE_RULE);
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                fixtureScript,
                snakeCaseDiagnostic.range.start.translate(0, 1),
            );
            assert.match(hoverMarkdownText(hovers), new RegExp(SNAKE_CASE_RULE));
        });

        test('offers rule specific quick fixes and ignore actions', async () => {
            const snakeCaseDiagnostic = findRuleDiagnostic(fixtureScript, SNAKE_CASE_RULE);
            const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                fixtureScript,
                snakeCaseDiagnostic.range,
                vscode.CodeActionKind.QuickFix.value,
            );
            const actionKinds = codeActions.flatMap((codeAction) => codeAction.kind?.value ?? []);
            assert.ok(
                actionKinds.includes(`quickfix.nu-lint.${SNAKE_CASE_RULE}`),
                `missing rename fix in ${JSON.stringify(actionKinds)}`,
            );
            assert.ok(
                actionKinds.includes(`quickfix.nu-lint.ignore.${SNAKE_CASE_RULE}`),
                `missing ignore action in ${JSON.stringify(actionKinds)}`,
            );
        });

        test('relints when the user config file changes on disk', async () => {
            await writeFile(userConfigFile, `[rules]\n${REDUNDANT_ECHO_RULE} = "off"\n`);
            await waitForRuleCodes(
                fixtureScript,
                'redundant_echo to disappear after disabling it',
                (currentCodes) => currentCodes.includes(SNAKE_CASE_RULE) && !currentCodes.includes(REDUNDANT_ECHO_RULE),
            );

            await rm(userConfigFile);
            await waitForRuleCodes(fixtureScript, 'redundant_echo to return after deleting the config', (currentCodes) =>
                currentCodes.includes(REDUNDANT_ECHO_RULE),
            );
        });

        test('fix all command applies every automatic fix', async () => {
            const untitledDocument = await vscode.workspace.openTextDocument({
                language: 'nushell',
                content: 'def main [] {\n    let myValue = 5\n    echo $myValue\n}\n',
            });
            await vscode.window.showTextDocument(untitledDocument);
            await waitForRuleCodes(untitledDocument.uri, 'diagnostics on the untitled document', (currentCodes) =>
                currentCodes.includes(SNAKE_CASE_RULE),
            );

            await vscode.commands.executeCommand('nu-lint.fixAll');

            const fixedText = untitledDocument.getText();
            assert.match(fixedText, /my_value/);
            assert.doesNotMatch(fixedText, /myValue/);
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        });

        test('writes server logs to the configured log file', async function () {
            if (!(await installedServerSupportsLogFlags())) {
                this.skip();
            }
            const extensionSettings = vscode.workspace.getConfiguration('nu-lint');
            const serverLogFile = join(tmpdir(), `nu-lint-e2e-${String(process.pid)}`, 'lsp.log');
            try {
                await extensionSettings.update('server.logLevel', 'info', vscode.ConfigurationTarget.Global);
                await extensionSettings.update('server.logFile', serverLogFile, vscode.ConfigurationTarget.Global);
                await waitForFileContaining(serverLogFile, 'nu-lint LSP server initialized');
            } finally {
                await extensionSettings.update('server.logLevel', undefined, vscode.ConfigurationTarget.Global);
                await extensionSettings.update('server.logFile', undefined, vscode.ConfigurationTarget.Global);
                await rm(dirname(serverLogFile), { recursive: true, force: true });
            }
            await waitForRuleCodes(fixtureScript, 'diagnostics after the logging restart', (currentCodes) =>
                currentCodes.includes(SNAKE_CASE_RULE),
            );
        });

        test('starts legacy nu-lint releases with the --lsp flag', async () => {
            const legacyDirectory = await mkdtemp(join(tmpdir(), 'nu-lint-legacy-'));
            const legacyExecutable = join(legacyDirectory, LEGACY_SCRIPT_NAME);
            const invocationLog = join(legacyDirectory, 'invocations.log');
            await copyFile(join(__dirname, LEGACY_SCRIPT_NAME), legacyExecutable);
            await chmod(legacyExecutable, 0o755);
            const extensionSettings = vscode.workspace.getConfiguration('nu-lint');
            try {
                await extensionSettings.update('executablePath', legacyExecutable, vscode.ConfigurationTarget.Global);
                await waitForFileContaining(invocationLog, '--lsp');
                await waitForRuleCodes(fixtureScript, 'diagnostics from the legacy server', (currentCodes) =>
                    currentCodes.includes(SNAKE_CASE_RULE),
                );
                const invocations = await readFile(invocationLog, 'utf8');
                assert.doesNotMatch(invocations, /^lsp/m);
            } finally {
                await extensionSettings.update('executablePath', undefined, vscode.ConfigurationTarget.Global);
                await rm(legacyDirectory, { recursive: true, force: true });
            }
            await waitForRuleCodes(fixtureScript, 'diagnostics after restoring the executable', (currentCodes) =>
                currentCodes.includes(SNAKE_CASE_RULE),
            );
        });

        test('restart command brings diagnostics back', async () => {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fixtureScript));
            await vscode.commands.executeCommand('nu-lint.restartServer');
            await waitForRuleCodes(fixtureScript, 'diagnostics after restarting the server', (currentCodes) =>
                currentCodes.includes(SNAKE_CASE_RULE),
            );
        });
    });
}
