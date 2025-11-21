import * as vscode from 'vscode';
import * as path from 'path';
import { LegacyNuLintViolation } from './legacy';
import { VSCodeDiagnosticData } from './parsing';

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

    for (const violation of violations) {
        const absolutePath = resolveViolationPath(violation.file, workspaceRoot);

        if (targetFileUri === null || path.resolve(absolutePath) === path.resolve(targetFileUri.fsPath)) {
            const fileUri = vscode.Uri.file(absolutePath);
            const fileDiagnostics = diagnostics.get(absolutePath) ?? [];
            const fileViolations = violationsByFile.get(absolutePath) ?? [];

            const diagnostic = createLegacyDiagnostic(violation, fileUri);

            fileDiagnostics.push(diagnostic);
            fileViolations.push(violation);
            diagnostics.set(absolutePath, fileDiagnostics);
            violationsByFile.set(absolutePath, fileViolations);
        }
    }

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

        if (codeActionProvider !== undefined) {
            const fileViolations = result.violations.get(filePath) ?? [];
            codeActionProvider.updateViolations(fileUri, fileViolations);
        }
    }
}

function resolveViolationPath(violationFile: string, workspaceRoot?: string): string {
    return path.isAbsolute(violationFile) ? violationFile : path.join(workspaceRoot ?? '', violationFile);
}

function createLegacyDiagnostic(violation: LegacyNuLintViolation, fileUri: vscode.Uri): vscode.Diagnostic {
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

function createVSCodeDiagnostic(vscodeDiagnostic: VSCodeDiagnosticData, workspaceRoot?: string): vscode.Diagnostic {
    const range = new vscode.Range(
        new vscode.Position(vscodeDiagnostic.range.start.line, vscodeDiagnostic.range.start.character),
        new vscode.Position(vscodeDiagnostic.range.end.line, vscodeDiagnostic.range.end.character)
    );

    const diagnostic = new vscode.Diagnostic(
        range,
        vscodeDiagnostic.message,
        mapVSCodeSeverityToVSCode(vscodeDiagnostic.severity)
    ); 

    diagnostic.source = 'nu-lint';
    diagnostic.code = vscodeDiagnostic.code;

    if (vscodeDiagnostic.related_information !== undefined) {
        diagnostic.relatedInformation = vscodeDiagnostic.related_information.map(info =>
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(
                    vscode.Uri.file(resolveViolationPath(info.location.uri, workspaceRoot)),
                    new vscode.Range(
                        new vscode.Position(info.location.range.start.line, info.location.range.start.character),
                        new vscode.Position(info.location.range.end.line, info.location.range.end.character)
                    )
                ),
                info.message
            )
        );
    }

    return diagnostic;
}



function mapSeverityToVSCode(severity: string): vscode.DiagnosticSeverity {
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

function mapVSCodeSeverityToVSCode(severity: number): vscode.DiagnosticSeverity {
    switch (severity) {
        case 1:
            return vscode.DiagnosticSeverity.Error;
        case 2:
            return vscode.DiagnosticSeverity.Warning;
        case 3:
        case 4:
            return vscode.DiagnosticSeverity.Information;
        default:
            return vscode.DiagnosticSeverity.Warning;
    }
}

