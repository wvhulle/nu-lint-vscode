import { LegacyNuLintViolation, LegacyNuLintOutput } from './legacy';
import { NuLintFormat } from './execution';

export interface VSCodeDiagnosticData {
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    severity: number;
    code: string;
    source: string;
    message: string;
    related_information?: {
        location: {
            uri: string;
            range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
            };
        };
        message: string;
    }[];
    code_action?: {
        title: string;
        edits: {
            range: {
                start: { line: number; character: number };
                end: { line: number; character: number };
            };
            replacement_text: string;
        }[];
    };
}

export interface VSCodeLintOutput {
    diagnostics: Record<string, VSCodeDiagnosticData[]>;
    summary: {
        errors: number;
        warnings: number;
        info: number;
        files_checked: number;
    };
}

export interface ParsedNuLintOutput {
    violations: LegacyNuLintViolation[];
    vscodeData?: Record<string, VSCodeDiagnosticData[]>;
    summary: {
        errors: number;
        warnings: number;
        info: number;
        files_checked: number;
    };
}

export function parseNuLintOutput(stdout: string, format: NuLintFormat): ParsedNuLintOutput {
    if (stdout.trim().length === 0) {
        return {
            violations: [],
            /* eslint-disable-next-line @typescript-eslint/naming-convention */
            summary: { errors: 0, warnings: 0, info: 0, files_checked: 0 }
        };
    }

    if (format === 'vscode-json') {
        return parseVSCodeJsonOutput(stdout);
    }
    return parseLegacyJsonOutput(stdout);
}

function parseLegacyJsonOutput(stdout: string): ParsedNuLintOutput {
    const output = JSON.parse(stdout) as LegacyNuLintOutput;
    return {
        violations: output.violations ?? [],
        summary: output.summary
    };
}

function parseVSCodeJsonOutput(stdout: string): ParsedNuLintOutput {
    const output = JSON.parse(stdout) as VSCodeLintOutput;

    return {
        violations: [],
        vscodeData: output.diagnostics,
        summary: output.summary
    };
}