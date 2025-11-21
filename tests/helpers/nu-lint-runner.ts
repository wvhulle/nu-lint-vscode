import * as cp from 'child_process';
import * as path from 'path';
import { VSCodeLintOutput } from '../../src/parsing';

export interface NuLintTestOptions {
    format?: 'json' | 'vscode-json';
    configPath?: string;
    executablePath?: string;
}

export interface NuLintTestResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    parsed?: VSCodeLintOutput;
}

export async function runNuLintOnFixture(
    fixtureName: string,
    options: NuLintTestOptions = {}
): Promise<NuLintTestResult> {
    const fixturesDir = path.join(__dirname, '..', 'fixtures');
    const fixturePath = path.join(fixturesDir, fixtureName);
    
    return runNuLint(fixturePath, options);
}

export async function runNuLint(
    filePath: string,
    options: NuLintTestOptions = {}
): Promise<NuLintTestResult> {
    const format = options.format ?? 'vscode-json';
    const executablePath = options.executablePath ?? 'nu-lint';
    
    const args = ['-f', format];
    
    if (options.configPath !== undefined && options.configPath.length > 0) {
        args.push('--config', options.configPath);
    }
    
    args.push(filePath);
    
    return new Promise((resolve, reject) => {
        const child = cp.spawn(executablePath, args, {
            cwd: path.dirname(filePath)
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        
        child.on('close', (code: number | null) => {
            const exitCode = code ?? -1;
            const result: NuLintTestResult = {
                stdout,
                stderr,
                exitCode
            };
            
            if (stdout.trim().length > 0 && format === 'vscode-json') {
                try {
                    result.parsed = JSON.parse(stdout) as VSCodeLintOutput;
                } catch (error: unknown) {
                    result.parsed = undefined;
                }
            }
            
            resolve(result);
        });
        
        child.on('error', (error: Error) => {
            reject(new Error(`Failed to run nu-lint: ${error.message}`));
        });
    });
}

export async function getNuLintVersion(executablePath = 'nu-lint'): Promise<string | null> {
    return new Promise((resolve) => {
        const child = cp.spawn(executablePath, ['--version']);
        let stdout = '';
        
        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        
        child.on('close', (code: number | null) => {
            if (code === 0) {
                const match = stdout.match(/nu-lint\s+(\d+\.\d+\.\d+)/);
                resolve(match?.[1] ?? null);
            } else {
                resolve(null);
            }
        });
        
        child.on('error', () => {
            resolve(null);
        });
    });
}

export function isNuLintAvailable(): boolean {
    try {
        cp.execSync('which nu-lint', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

export function expectDiagnosticInOutput(
    output: VSCodeLintOutput,
    file: string,
    expectedCode: string
): boolean {
    const diagnostics = output.diagnostics[file];
    if (diagnostics === undefined) {
        return false;
    }
    
    return diagnostics.some(diag => diag.code === expectedCode);
}

export function getDiagnosticByCode(
    output: VSCodeLintOutput,
    file: string,
    code: string
): import('../../src/parsing').VSCodeDiagnosticData | undefined {
    const diagnostics = output.diagnostics[file];
    if (diagnostics === undefined) {
        return undefined;
    }
    
    return diagnostics.find(diag => diag.code === code);
}
