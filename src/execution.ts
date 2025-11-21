import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { getConfig } from './config';

export type NuLintFormat = 'json' | 'vscode-json';

export interface NuLintExecutionOptions {
    filePath: string;
    format: NuLintFormat;
    workspaceRoot?: string;
    configPath?: string;
    fix?: boolean;
}

export function createNuLintCommand(options: NuLintExecutionOptions): { executable: string; args: string[]; cwd: string; targetPath: string } {
    const config = getConfig();
    const workspaceRoot = options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = workspaceRoot ?? path.dirname(options.filePath);
    const targetPath = workspaceRoot !== undefined ? path.relative(workspaceRoot, options.filePath) : options.filePath;
    
    const configPath = options.configPath ?? config.configPath;
    const args = [
        '-f', options.format,
        ...(configPath.length > 0 ? ['--config', configPath] : []),
        ...(options.fix === true ? ['--fix'] : []),
        targetPath
    ];

    return {
        executable: config.executablePath,
        args,
        cwd,
        targetPath
    };
}

export async function execNuLint(options: NuLintExecutionOptions, logger: vscode.LogOutputChannel): Promise<string> {
    const { executable, args, cwd, targetPath } = createNuLintCommand(options);

    logger.debug(`Running: ${executable} ${args.join(' ')}`);
    logger.debug(`Working directory: ${cwd}`);
    logger.debug(`Target path: ${targetPath}`);

    return new Promise((resolve, reject) => {
        const child = cp.spawn(executable, args, { cwd });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
            logger.debug(`nu-lint process exited with code: ${String(code)}`);
            if (stdout.length > 0) {
                logger.trace(`stdout: ${stdout}`);
            }
            if (stderr.length > 0) {
                logger.trace(`stderr: ${stderr}`);
            }

            if (code === 0 || code === 1) {
                resolve(stdout);
            } else {
                const error = new Error(`nu-lint exited with code ${String(code)}: ${stderr}`);
                logger.error(error.message);
                reject(error);
            }
        });

        child.on('error', (error: Error) => {
            logger.error(`Failed to start nu-lint: ${error.message}`);
            reject(new Error(`Failed to start nu-lint: ${error.message}`));
        });
    });
}

export function detectNuLintFormat(version: string | null): NuLintFormat {
    if (version === null) {
        return 'json';
    }

    const [major, minor, patch] = version.split('.').map(part => parseInt(part, 10));

    if (major === undefined || minor === undefined || patch === undefined) {
        return 'json';
    }

    return (major > 0 || minor > 0 || patch >= 37) ? 'vscode-json' : 'json';
}

export async function getNuLintVersion(executablePath: string): Promise<string | null> {
    try {
        return new Promise((resolve, reject) => {
            const child = cp.spawn(executablePath, ['--version']);
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    const versionMatch = stdout.match(/nu-lint\s+(\d+\.\d+\.\d+)/);
                    resolve(versionMatch?.[1] ?? null);
                    return;
                }
                reject(new Error(`Version check failed with code ${String(code)}: ${stderr}`));
            });

            child.on('error', reject);
        });
    } catch {
        return null;
    }
}

export async function execNuLintFix(filePath: string, logger: vscode.LogOutputChannel): Promise<void> {
    const config = getConfig();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = workspaceRoot ?? path.dirname(filePath);
    const targetPath = workspaceRoot !== undefined ? path.relative(workspaceRoot, filePath) : filePath;

    const args = [
        '--fix',
        ...(config.configPath.length > 0 ? ['--config', config.configPath] : []),
        targetPath
    ];

    logger.debug(`Running fix: ${config.executablePath} ${args.join(' ')}`);
    logger.debug(`Working directory: ${cwd}`);

    return new Promise((resolve, reject) => {
        const child = cp.spawn(config.executablePath, args, { cwd });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
            logger.debug(`nu-lint --fix exited with code: ${String(code)}`);
            if (stdout.length > 0) {
                logger.trace(`stdout: ${stdout}`);
            }
            if (stderr.length > 0) {
                logger.trace(`stderr: ${stderr}`);
            }

            if (code === 0 || code === 1) {
                resolve();
            } else {
                const error = new Error(`nu-lint --fix failed with code ${String(code)}: ${stderr}`);
                logger.error(error.message);
                reject(error);
            }
        });

        child.on('error', (error: Error) => {
            logger.error(`Failed to run nu-lint --fix: ${error.message}`);
            reject(new Error(`Failed to run nu-lint --fix: ${error.message}`));
        });
    });
}

export async function execNuLintFixStdin(content: string, logger: vscode.LogOutputChannel): Promise<string> {
    const config = getConfig();

    const args = [
        '--fix',
        ...(config.configPath.length > 0 ? ['--config', config.configPath] : [])
    ];

    logger.debug(`Running fix via stdin: ${config.executablePath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
        const child = cp.spawn(config.executablePath, args);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
            logger.debug(`nu-lint --fix (stdin) exited with code: ${String(code)}`);
            if (stderr.length > 0) {
                logger.trace(`stderr: ${stderr}`);
            }

            if (code === 0 || code === 1) {
                resolve(stdout);
            } else {
                const error = new Error(`nu-lint --fix (stdin) failed with code ${String(code)}: ${stderr}`);
                logger.error(error.message);
                reject(error);
            }
        });

        child.on('error', (error: Error) => {
            logger.error(`Failed to run nu-lint --fix (stdin): ${error.message}`);
            reject(new Error(`Failed to run nu-lint --fix (stdin): ${error.message}`));
        });

        child.stdin.write(content);
        child.stdin.end();
    });
}