import { execFile } from 'node:child_process';

export interface SemanticVersion {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
}

export const MINIMUM_VERSION_WITH_LSP_FLAG: SemanticVersion = { major: 0, minor: 0, patch: 62 };
export const MINIMUM_VERSION_WITH_LSP_SUBCOMMAND: SemanticVersion = { major: 1, minor: 7, patch: 0 };

export type ServerVersionProbe =
    | { readonly outcome: 'current'; readonly installedVersion: SemanticVersion }
    | { readonly outcome: 'legacy'; readonly installedVersion: SemanticVersion }
    | { readonly outcome: 'outdated'; readonly installedVersion: SemanticVersion }
    | { readonly outcome: 'unrecognized'; readonly versionOutput: string }
    | { readonly outcome: 'missing'; readonly failureMessage: string };

export type LaunchableServerVersion = Extract<ServerVersionProbe, { outcome: 'current' | 'legacy' | 'unrecognized' }>;

const VERSION_PATTERN = /(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/;

export function parseNuLintVersionOutput(versionOutput: string): SemanticVersion | undefined {
    const versionComponents = VERSION_PATTERN.exec(versionOutput)?.groups;
    if (versionComponents === undefined) {
        return undefined;
    }
    return {
        major: Number(versionComponents.major),
        minor: Number(versionComponents.minor),
        patch: Number(versionComponents.patch),
    };
}

export function isVersionAtLeast(installedVersion: SemanticVersion, minimumVersion: SemanticVersion): boolean {
    if (installedVersion.major !== minimumVersion.major) {
        return installedVersion.major > minimumVersion.major;
    }
    if (installedVersion.minor !== minimumVersion.minor) {
        return installedVersion.minor > minimumVersion.minor;
    }
    return installedVersion.patch >= minimumVersion.patch;
}

export function formatSemanticVersion(version: SemanticVersion): string {
    return `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`;
}

export function classifyVersionOutput(versionOutput: string): ServerVersionProbe {
    const installedVersion = parseNuLintVersionOutput(versionOutput);
    if (!installedVersion) {
        return { outcome: 'unrecognized', versionOutput };
    }
    if (isVersionAtLeast(installedVersion, MINIMUM_VERSION_WITH_LSP_SUBCOMMAND)) {
        return { outcome: 'current', installedVersion };
    }
    if (isVersionAtLeast(installedVersion, MINIMUM_VERSION_WITH_LSP_FLAG)) {
        return { outcome: 'legacy', installedVersion };
    }
    return { outcome: 'outdated', installedVersion };
}

export function probeServerVersion(executablePath: string): Promise<ServerVersionProbe> {
    return new Promise((resolveProbe) => {
        execFile(executablePath, ['--version'], { timeout: 10_000 }, (spawnFailure, standardOutput) => {
            if (spawnFailure) {
                resolveProbe({ outcome: 'missing', failureMessage: spawnFailure.message });
                return;
            }
            resolveProbe(classifyVersionOutput(standardOutput));
        });
    });
}

export function readExampleConfig(executablePath: string): Promise<string | undefined> {
    return new Promise((resolveExample) => {
        execFile(executablePath, ['config', 'example'], { timeout: 10_000 }, (spawnFailure, standardOutput) => {
            resolveExample(spawnFailure ? undefined : standardOutput);
        });
    });
}
