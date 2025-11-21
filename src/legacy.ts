import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { getConfig } from './config';

export interface LegacyNuLintViolation {
    rule_id: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    file: string;
    line_start: number;
    line_end: number;
    column_start: number;
    column_end: number;
    offset_start: number;
    offset_end: number;
    suggestion?: string;
    fix?: {
        description: string;
        replacements: {
            offset_start: number;
            offset_end: number;
            new_text: string;
        }[];
    } | null;
}

export interface LegacyNuLintOutput {
    violations: LegacyNuLintViolation[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
        files_checked: number;
    };
}

export function parseNuLintJsonOutput(stdout: string): LegacyNuLintViolation[] {
    if (stdout.trim().length === 0) {
        return [];
    }

    const output = JSON.parse(stdout) as LegacyNuLintOutput;
    return output.violations ?? [];
}

export function mapSeverityToVSCode(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        case 'info':
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

export function resolveViolationPath(violationFile: string, workspaceRoot: string | undefined): string {
    return path.isAbsolute(violationFile) ? violationFile : path.join(workspaceRoot ?? '', violationFile);
}

export function createLegacyDiagnostic(violation: LegacyNuLintViolation, fileUri: vscode.Uri): vscode.Diagnostic {
    const range = new vscode.Range(
        new vscode.Position(violation.line_start - 1, violation.column_start - 1),
        new vscode.Position(violation.line_end - 1, violation.column_end - 1)
    );

    const diagnostic = new vscode.Diagnostic(
        range,
        `${violation.message} (${violation.rule_id})`,
        mapSeverityToVSCode(violation.severity)
    );
    diagnostic.source = 'nu-lint';
    diagnostic.code = violation.rule_id;

    if (violation.suggestion !== undefined) {
        diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(fileUri, range),
                violation.suggestion
            )
        ];
    }

    return diagnostic;
}

export function processLegacyViolations(
    violations: LegacyNuLintViolation[],
    uri: vscode.Uri | null,
    workspaceRoot: string | undefined
): { diagnosticsByFile: Map<string, vscode.Diagnostic[]>; violationsByFile: Map<string, LegacyNuLintViolation[]> } {
    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();
    const violationsByFile = new Map<string, LegacyNuLintViolation[]>();

    for (const violation of violations) {
        const violationAbsolutePath = resolveViolationPath(violation.file, workspaceRoot);

        if (uri === null || path.resolve(violationAbsolutePath) === path.resolve(uri.fsPath)) {
            const fileUri = vscode.Uri.file(violationAbsolutePath);
            const diagnostics = diagnosticsByFile.get(violationAbsolutePath) ?? [];
            const fileViolations = violationsByFile.get(violationAbsolutePath) ?? [];

            const diagnostic = createLegacyDiagnostic(violation, fileUri);

            diagnostics.push(diagnostic);
            fileViolations.push(violation);
            diagnosticsByFile.set(violationAbsolutePath, diagnostics);
            violationsByFile.set(violationAbsolutePath, fileViolations);
        }
    }

    return { diagnosticsByFile, violationsByFile };
}

export async function runNuLintLegacyFormat(
    filePath: string,
    logger: vscode.LogOutputChannel
): Promise<LegacyNuLintViolation[]> {
    const config = getConfig();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const cwd = workspaceRoot ?? path.dirname(filePath);
    const targetPath = workspaceRoot !== undefined ? path.relative(workspaceRoot, filePath) : filePath;

    const args: string[] = ['-f', 'json'];

    if (config.configPath.length > 0) {
        args.push('--config', config.configPath);
    }
    args.push(targetPath);

    logger.debug(`Running: ${config.executablePath} ${args.join(' ')}`);
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
            handleLegacyProcessClose(code, stdout, stderr, resolve, reject, logger);
        });

        child.on('error', (error: Error) => {
            logger.error(`Failed to start nu-lint: ${error.message}`);
            reject(new Error(`Failed to start nu-lint: ${error.message}`));
        });
    });
}

function handleLegacyProcessClose(
    code: number | null,
    stdout: string,
    stderr: string,
    resolve: (value: LegacyNuLintViolation[]) => void,
    reject: (reason: Error) => void,
    logger: vscode.LogOutputChannel
): void {
    logger.debug(`nu-lint process exited with code: ${String(code)}`);
    if (stdout.length > 0) {
        logger.trace(`stdout: ${stdout}`);
    }
    if (stderr.length > 0) {
        logger.trace(`stderr: ${stderr}`);
    }

    if (code === 0 || code === 1) {
        try {
            const violations = parseNuLintJsonOutput(stdout);
            resolve(violations);
        } catch (parseError: unknown) {
            logger.error(`Failed to parse nu-lint output: ${String(parseError)}`);
            reject(new Error(`Failed to parse nu-lint output: ${String(parseError)}`));
        }
        return;
    }

    logger.error(`nu-lint exited with code ${String(code)}: ${stderr}`);
    reject(new Error(`nu-lint exited with code ${String(code)}: ${stderr}`));
}