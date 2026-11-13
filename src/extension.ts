import { mkdir, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import {
    DidChangeWatchedFilesNotification,
    FileChangeType,
    LanguageClient,
    type DocumentSelector,
    type LanguageClientOptions,
    type ServerOptions,
} from 'vscode-languageclient/node';
import {
    MINIMUM_VERSION_WITH_LSP_SUBCOMMAND,
    formatSemanticVersion,
    probeServerVersion,
    readExampleConfig,
    type LaunchableServerVersion,
    type ServerVersionProbe,
} from './server_version_check.ts';
import {
    MINIMUM_VERSION_WITH_LOG_FLAGS,
    parseServerLogLevel,
    planServerLaunch,
    type ServerCompatibility,
    type ServerLogSettings,
} from './server_arguments.ts';
import { USER_CONFIG_FILE_NAME, resolveUserConfigFile } from './user_config_location.ts';

const EXTENSION_SETTINGS_SECTION = 'nu-lint';
const EXECUTABLE_PATH_SETTING = 'executablePath';
const SERVER_LOG_LEVEL_SETTING = 'server.logLevel';
const SERVER_LOG_FILE_SETTING = 'server.logFile';
const SETTINGS_REQUIRING_RESTART = [EXECUTABLE_PATH_SETTING, SERVER_LOG_LEVEL_SETTING, SERVER_LOG_FILE_SETTING];
const INSTALL_INSTRUCTIONS_URL = 'https://codeberg.org/wvhulle/nu-lint#installation';
const NUSHELL_LANGUAGE_IDS = ['nushell', 'nu'] as const;

const NUSHELL_DOCUMENT_SELECTOR: DocumentSelector = NUSHELL_LANGUAGE_IDS.flatMap((languageId) => [
    { language: languageId, scheme: 'file' },
    { language: languageId, scheme: 'untitled' },
]);

function readExecutablePath(): string {
    return vscode.workspace
        .getConfiguration(EXTENSION_SETTINGS_SECTION)
        .get<string>(EXECUTABLE_PATH_SETTING, 'nu-lint');
}

function readServerLogSettings(): ServerLogSettings {
    const extensionSettings = vscode.workspace.getConfiguration(EXTENSION_SETTINGS_SECTION);
    return {
        logLevel: parseServerLogLevel(extensionSettings.get(SERVER_LOG_LEVEL_SETTING)),
        logFile: extensionSettings.get<string>(SERVER_LOG_FILE_SETTING, ''),
    };
}

function locateUserConfigFile(): string | undefined {
    return resolveUserConfigFile({
        platform: process.platform,
        homeDirectory: homedir(),
        environmentVariables: process.env,
    });
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

type UnusableServerVersion = Extract<ServerVersionProbe, { outcome: 'missing' | 'outdated' }>;

const SUBCOMMAND_VERSION_TEXT = formatSemanticVersion(MINIMUM_VERSION_WITH_LSP_SUBCOMMAND);
const LOG_FLAGS_VERSION_TEXT = formatSemanticVersion(MINIMUM_VERSION_WITH_LOG_FLAGS);

function describeUnusableServer(executablePath: string, serverVersion: UnusableServerVersion): string {
    switch (serverVersion.outcome) {
        case 'missing':
            return `Nu-Lint could not run '${executablePath}': ${serverVersion.failureMessage}. Install nu-lint >= ${SUBCOMMAND_VERSION_TEXT} or set 'nu-lint.executablePath'.`;
        case 'outdated':
            return `nu-lint ${formatSemanticVersion(serverVersion.installedVersion)} has no language server. Upgrade to nu-lint >= ${SUBCOMMAND_VERSION_TEXT}.`;
    }
}

function describeVersion(serverVersion: LaunchableServerVersion): string {
    return serverVersion.outcome === 'unrecognized'
        ? 'unknown version'
        : formatSemanticVersion(serverVersion.installedVersion);
}

function describeCompatibilityWarning(
    executablePath: string,
    serverVersion: LaunchableServerVersion,
    compatibility: ServerCompatibility,
): string | undefined {
    switch (compatibility) {
        case 'full':
            return undefined;
        case 'legacy-lsp-flag':
            return `nu-lint ${describeVersion(serverVersion)} is outdated and runs in compatibility mode. Upgrade to nu-lint >= ${SUBCOMMAND_VERSION_TEXT} for all features.`;
        case 'log-settings-ignored':
            return `nu-lint ${describeVersion(serverVersion)} ignores 'nu-lint.server.logLevel' and 'nu-lint.server.logFile'. Upgrade to nu-lint >= ${LOG_FLAGS_VERSION_TEXT} to use them.`;
        case 'unknown-version':
            return `Could not determine the version of '${executablePath}', so it runs in compatibility mode. Upgrade to nu-lint >= ${SUBCOMMAND_VERSION_TEXT} if features are missing.`;
    }
}

type ServerLifecycle =
    | { readonly phase: 'stopped' }
    | { readonly phase: 'running'; readonly languageClient: LanguageClient };

type StatusPresentation =
    | { readonly kind: 'starting' }
    | { readonly kind: 'running'; readonly versionLabel: string; readonly executablePath: string }
    | { readonly kind: 'degraded'; readonly versionLabel: string; readonly explanation: string }
    | { readonly kind: 'unavailable'; readonly explanation: string }
    | { readonly kind: 'failed'; readonly explanation: string };

function presentStatus(languageStatus: vscode.LanguageStatusItem, presentation: StatusPresentation): void {
    switch (presentation.kind) {
        case 'starting':
            languageStatus.text = 'nu-lint';
            languageStatus.detail = 'Starting';
            languageStatus.severity = vscode.LanguageStatusSeverity.Information;
            languageStatus.busy = true;
            return;
        case 'running':
            languageStatus.text = `nu-lint ${presentation.versionLabel}`;
            languageStatus.detail = presentation.executablePath;
            languageStatus.severity = vscode.LanguageStatusSeverity.Information;
            languageStatus.busy = false;
            return;
        case 'degraded':
            languageStatus.text = `nu-lint ${presentation.versionLabel}`;
            languageStatus.detail = presentation.explanation;
            languageStatus.severity = vscode.LanguageStatusSeverity.Warning;
            languageStatus.busy = false;
            return;
        case 'unavailable':
            languageStatus.text = 'nu-lint unavailable';
            languageStatus.detail = presentation.explanation;
            languageStatus.severity = vscode.LanguageStatusSeverity.Error;
            languageStatus.busy = false;
            return;
        case 'failed':
            languageStatus.text = 'nu-lint failed';
            languageStatus.detail = presentation.explanation;
            languageStatus.severity = vscode.LanguageStatusSeverity.Error;
            languageStatus.busy = false;
            return;
    }
}

function describeFailure(thrownValue: unknown): string {
    return thrownValue instanceof Error ? thrownValue.message : String(thrownValue);
}

type NotificationSeverity = 'error' | 'warning';

async function offerInstallInstructions(notificationText: string, notificationSeverity: NotificationSeverity): Promise<void> {
    const installChoice = 'Install Instructions';
    const settingsChoice = 'Open Settings';
    const showNotification =
        notificationSeverity === 'error' ? vscode.window.showErrorMessage : vscode.window.showWarningMessage;
    const chosenAction = await showNotification(notificationText, installChoice, settingsChoice);
    if (chosenAction === installChoice) {
        await vscode.env.openExternal(vscode.Uri.parse(INSTALL_INSTRUCTIONS_URL));
    } else if (chosenAction === settingsChoice) {
        await vscode.commands.executeCommand('workbench.action.openSettings', EXTENSION_SETTINGS_SECTION);
    }
}

class LanguageServerController implements vscode.Disposable {
    private serverLifecycle: ServerLifecycle = { phase: 'stopped' };
    private readonly notifiedTexts = new Set<string>();
    private queuedTransition: Promise<void> = Promise.resolve();
    private readonly outputChannel = vscode.window.createOutputChannel('Nu-Lint', { log: true });
    private readonly languageStatus = vscode.languages.createLanguageStatusItem('nu-lint.status', [
        ...NUSHELL_LANGUAGE_IDS,
    ]);

    constructor() {
        this.languageStatus.name = 'Nu-Lint';
        this.languageStatus.command = { title: 'Restart', command: 'nu-lint.restartServer' };
    }

    private async start(): Promise<void> {
        const executablePath = readExecutablePath();
        presentStatus(this.languageStatus, { kind: 'starting' });

        const versionProbe = await probeServerVersion(executablePath);
        if (versionProbe.outcome === 'missing' || versionProbe.outcome === 'outdated') {
            const unusableServerMessage = describeUnusableServer(executablePath, versionProbe);
            this.outputChannel.error(unusableServerMessage);
            presentStatus(this.languageStatus, { kind: 'unavailable', explanation: unusableServerMessage });
            this.notifyOnce(unusableServerMessage, 'error');
            return;
        }
        if (versionProbe.outcome === 'unrecognized') {
            this.outputChannel.warn(`Could not parse version output: ${versionProbe.versionOutput}`);
        }

        const versionLabel = describeVersion(versionProbe);
        const launchPlan = planServerLaunch(versionProbe, readServerLogSettings());
        const compatibilityWarning = describeCompatibilityWarning(
            executablePath,
            versionProbe,
            launchPlan.compatibility,
        );
        if (compatibilityWarning !== undefined) {
            this.outputChannel.warn(compatibilityWarning);
            this.notifyOnce(compatibilityWarning, 'warning');
        }

        const commandArguments = [...launchPlan.commandArguments];
        this.outputChannel.info(`Starting '${executablePath} ${commandArguments.join(' ')}' (${versionLabel})`);

        const serverOptions: ServerOptions = { command: executablePath, args: commandArguments };
        const clientOptions: LanguageClientOptions = {
            documentSelector: NUSHELL_DOCUMENT_SELECTOR,
            outputChannel: this.outputChannel,
        };
        const languageClient = new LanguageClient(
            EXTENSION_SETTINGS_SECTION,
            'Nu-Lint Language Server',
            serverOptions,
            clientOptions,
        );

        try {
            await languageClient.start();
        } catch (startFailure) {
            const failureMessage = `Nu-Lint language server failed to start: ${describeFailure(startFailure)}. Make sure nu-lint >= ${SUBCOMMAND_VERSION_TEXT} is installed.`;
            this.outputChannel.error(failureMessage);
            presentStatus(this.languageStatus, { kind: 'failed', explanation: failureMessage });
            this.notifyOnce(failureMessage, 'error');
            return;
        }
        this.serverLifecycle = { phase: 'running', languageClient };
        presentStatus(
            this.languageStatus,
            compatibilityWarning === undefined
                ? { kind: 'running', versionLabel, executablePath }
                : { kind: 'degraded', versionLabel, explanation: compatibilityWarning },
        );
    }

    private notifyOnce(notificationText: string, notificationSeverity: NotificationSeverity): void {
        if (this.notifiedTexts.has(notificationText)) {
            return;
        }
        this.notifiedTexts.add(notificationText);
        void offerInstallInstructions(notificationText, notificationSeverity);
    }

    async stop(): Promise<void> {
        const stoppingLifecycle = this.serverLifecycle;
        this.serverLifecycle = { phase: 'stopped' };
        if (stoppingLifecycle.phase === 'running') {
            await stoppingLifecycle.languageClient.dispose();
        }
    }

    showLogs(): void {
        this.outputChannel.show(true);
    }

    restart(): Promise<void> {
        this.queuedTransition = this.queuedTransition.then(async () => {
            await this.stop();
            await this.start();
        });
        return this.queuedTransition;
    }

    notifyUserConfigChanged(configUri: vscode.Uri, changeType: FileChangeType): void {
        if (this.serverLifecycle.phase !== 'running') {
            return;
        }
        const { languageClient } = this.serverLifecycle;
        this.outputChannel.info(`User config changed: ${configUri.fsPath}`);
        void languageClient.sendNotification(DidChangeWatchedFilesNotification.type, {
            changes: [{ uri: languageClient.code2ProtocolConverter.asUri(configUri), type: changeType }],
        });
    }

    dispose(): void {
        void this.stop();
        this.languageStatus.dispose();
        this.outputChannel.dispose();
    }
}

function watchUserConfigFile(controller: LanguageServerController): vscode.Disposable[] {
    const userConfigFile = locateUserConfigFile();
    if (userConfigFile === undefined) {
        return [];
    }
    const configWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(dirname(userConfigFile)), USER_CONFIG_FILE_NAME),
    );
    return [
        configWatcher,
        configWatcher.onDidCreate((configUri) => {
            controller.notifyUserConfigChanged(configUri, FileChangeType.Created);
        }),
        configWatcher.onDidChange((configUri) => {
            controller.notifyUserConfigChanged(configUri, FileChangeType.Changed);
        }),
        configWatcher.onDidDelete((configUri) => {
            controller.notifyUserConfigChanged(configUri, FileChangeType.Deleted);
        }),
    ];
}

async function applyAllAutomaticFixes(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const targetDocument = activeEditor.document;
    const wholeDocumentRange = targetDocument.validateRange(
        new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    );
    const fixAllActions = await vscode.commands.executeCommand<vscode.CodeAction[] | undefined>(
        'vscode.executeCodeActionProvider',
        targetDocument.uri,
        wholeDocumentRange,
        vscode.CodeActionKind.SourceFixAll.value,
    );
    const applicableAction = fixAllActions?.find((codeAction) => codeAction.edit !== undefined);
    if (applicableAction?.edit === undefined) {
        void vscode.window.showInformationMessage('Nu-Lint: no automatic fixes available.');
        return;
    }
    await vscode.workspace.applyEdit(applicableAction.edit);
}

async function openUserConfigFile(): Promise<void> {
    const userConfigFile = locateUserConfigFile();
    if (userConfigFile === undefined) {
        void vscode.window.showErrorMessage('Nu-Lint: could not determine the user configuration directory.');
        return;
    }
    if (!(await fileExists(userConfigFile))) {
        const exampleConfig = await readExampleConfig(readExecutablePath());
        await mkdir(dirname(userConfigFile), { recursive: true });
        await writeFile(userConfigFile, exampleConfig ?? '');
    }
    const configDocument = await vscode.workspace.openTextDocument(userConfigFile);
    await vscode.window.showTextDocument(configDocument);
}

let activeController: LanguageServerController | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const controller = new LanguageServerController();
    activeController = controller;
    context.subscriptions.push(
        controller,
        ...watchUserConfigFile(controller),
        vscode.commands.registerCommand('nu-lint.restartServer', () => controller.restart()),
        vscode.commands.registerCommand('nu-lint.showOutput', () => {
            controller.showLogs();
        }),
        vscode.commands.registerCommand('nu-lint.fixAll', applyAllAutomaticFixes),
        vscode.commands.registerCommand('nu-lint.openUserConfig', openUserConfigFile),
        vscode.workspace.onDidChangeConfiguration((configurationChange) => {
            const requiresRestart = SETTINGS_REQUIRING_RESTART.some((settingName) =>
                configurationChange.affectsConfiguration(`${EXTENSION_SETTINGS_SECTION}.${settingName}`),
            );
            if (requiresRestart) {
                void controller.restart();
            }
        }),
    );
    await controller.restart();
}

export async function deactivate(): Promise<void> {
    await activeController?.stop();
    activeController = undefined;
}
