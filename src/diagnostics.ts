import * as vscode from 'vscode';
import * as path from 'path';
import { LegacyNuLintViolation } from './legacy';
import { VSCodeDiagnosticData } from './parsing';
import { resolveViolationPath, createLegacyDiagnostic, createVSCodeDiagnostic } from './diagnostic-utils';

export interface DiagnosticsResult {
    diagnostics: Map<string, vscode.Diagnostic[]>;
    violations: Map<string, LegacyNuLintViolation[]>;
}

export function createDiagnosticsFromLegacy(
    violations: LegacyNuLintViolation[],
    targetFileUri: vscode.Uri | null,
    workspaceRoot?: string
): DiagnosticsResult {
    const diagnostics = new Map<string, vscode.Diagnostic[]>();
    const violationsByFile = new Map<string, LegacyNuLintViolation[]>();

    violations
        .filter(violation => {
            const absolutePath = resolveViolationPath(violation.file, workspaceRoot);
            return targetFileUri === null || path.resolve(absolutePath) === path.resolve(targetFileUri.fsPath);
        })
        .forEach(violation => {
            const absolutePath = resolveViolationPath(violation.file, workspaceRoot);
            const fileUri = vscode.Uri.file(absolutePath);
            const diagnostic = createLegacyDiagnostic(violation, fileUri);

            diagnostics.set(absolutePath, [...(diagnostics.get(absolutePath) ?? []), diagnostic]);
            violationsByFile.set(absolutePath, [...(violationsByFile.get(absolutePath) ?? []), violation]);
        });

    return { diagnostics, violations: violationsByFile };
}

export function createDiagnosticsFromVSCode(
    vscodeData: Record<string, VSCodeDiagnosticData[]>,
    targetFileUri: vscode.Uri,
    workspaceRoot?: string
): DiagnosticsResult {
    const diagnostics = new Map<string, vscode.Diagnostic[]>();
    const violationsByFile = new Map<string, LegacyNuLintViolation[]>();

    for (const [file, vscodeDiagnostics] of Object.entries(vscodeData)) {
        const absolutePath = resolveViolationPath(file, workspaceRoot);

        if (path.resolve(absolutePath) === path.resolve(targetFileUri.fsPath)) {
            const fileDiagnostics: vscode.Diagnostic[] = [];

            for (const vscodeDiagnostic of vscodeDiagnostics) {
                const diagnostic = createVSCodeDiagnostic(vscodeDiagnostic, workspaceRoot);
                fileDiagnostics.push(diagnostic);
            }

            diagnostics.set(absolutePath, fileDiagnostics);
        }
    }

    return { diagnostics, violations: violationsByFile };
}

export function applyDiagnostics(
    diagnosticCollection: vscode.DiagnosticCollection,
    codeActionProvider: { updateViolations(uri: vscode.Uri, violations: LegacyNuLintViolation[]): void } | undefined,
    result: DiagnosticsResult
): void {
    for (const [filePath, fileDiagnostics] of result.diagnostics) {
        const fileUri = vscode.Uri.file(filePath);
        diagnosticCollection.set(fileUri, fileDiagnostics);
        codeActionProvider?.updateViolations(fileUri, result.violations.get(filePath) ?? []);
    }
}
