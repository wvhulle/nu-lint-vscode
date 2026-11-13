import { isVersionAtLeast, type LaunchableServerVersion, type SemanticVersion } from './server_version_check.ts';

export const SERVER_LOG_LEVELS = ['off', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type ServerLogLevel = (typeof SERVER_LOG_LEVELS)[number];
export const DEFAULT_SERVER_LOG_LEVEL: ServerLogLevel = 'warn';
export const MINIMUM_VERSION_WITH_LOG_FLAGS: SemanticVersion = { major: 1, minor: 10, patch: 0 };

export interface ServerLogSettings {
    readonly logLevel: ServerLogLevel;
    readonly logFile: string;
}

export type ServerCompatibility = 'full' | 'legacy-lsp-flag' | 'log-settings-ignored' | 'unknown-version';

export interface ServerLaunchPlan {
    readonly compatibility: ServerCompatibility;
    readonly commandArguments: readonly string[];
}

export function parseServerLogLevel(configuredLogLevel: unknown): ServerLogLevel {
    return SERVER_LOG_LEVELS.find((knownLogLevel) => knownLogLevel === configuredLogLevel) ?? DEFAULT_SERVER_LOG_LEVEL;
}

function hasCustomLogSettings(logSettings: ServerLogSettings): boolean {
    return logSettings.logLevel !== DEFAULT_SERVER_LOG_LEVEL || logSettings.logFile.trim() !== '';
}

function logFlagArguments(logSettings: ServerLogSettings): string[] {
    const trimmedLogFile = logSettings.logFile.trim();
    const logLevelArguments = ['--log-level', logSettings.logLevel];
    return trimmedLogFile === '' ? logLevelArguments : [...logLevelArguments, '--log-file', trimmedLogFile];
}

function planCurrentServerLaunch(installedVersion: SemanticVersion, logSettings: ServerLogSettings): ServerLaunchPlan {
    if (isVersionAtLeast(installedVersion, MINIMUM_VERSION_WITH_LOG_FLAGS)) {
        return { compatibility: 'full', commandArguments: ['lsp', ...logFlagArguments(logSettings)] };
    }
    return {
        compatibility: hasCustomLogSettings(logSettings) ? 'log-settings-ignored' : 'full',
        commandArguments: ['lsp'],
    };
}

export function planServerLaunch(serverVersion: LaunchableServerVersion, logSettings: ServerLogSettings): ServerLaunchPlan {
    switch (serverVersion.outcome) {
        case 'current':
            return planCurrentServerLaunch(serverVersion.installedVersion, logSettings);
        case 'legacy':
            return { compatibility: 'legacy-lsp-flag', commandArguments: ['--lsp'] };
        case 'unrecognized':
            return { compatibility: 'unknown-version', commandArguments: ['--lsp'] };
    }
}
