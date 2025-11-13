import * as vscode from 'vscode';

interface NuLintViolation {
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

export class NuLintCodeActionProvider implements vscode.CodeActionProvider {
    private readonly violations: Map<string, NuLintViolation[]> = new Map();

    public updateViolations(uri: vscode.Uri, violations: NuLintViolation[]): void {
        this.violations.set(uri.toString(), violations);
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const actions: vscode.CodeAction[] = [];
        const fileViolations = this.violations.get(document.uri.toString()) ?? [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source === 'nu-lint') {
                const violation = this.findMatchingViolation(diagnostic, range, fileViolations);

                if (violation?.fix !== null && violation?.fix !== undefined) {
                    const action = this.createFixAction(violation, document, diagnostic);
                    actions.push(action);
                }
            }
        }

        return actions;
    }

    private findMatchingViolation(
        diagnostic: vscode.Diagnostic,
        range: vscode.Range,
        fileViolations: NuLintViolation[]
    ): NuLintViolation | undefined {
        return fileViolations.find(v => {
            if (v.rule_id !== diagnostic.code) {
                return false;
            }

            const violationRange = new vscode.Range(
                new vscode.Position(v.line_start - 1, v.column_start - 1),
                new vscode.Position(v.line_end - 1, v.column_end - 1)
            );

            return this.rangesEqual(diagnostic.range, violationRange) &&
                   this.rangesOverlap(diagnostic.range, range);
        });
    }

    private createFixAction(
        violation: NuLintViolation,
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const { fix } = violation;
        if (fix === null || fix === undefined) {
            throw new Error('Fix is required');
        }

        const action = new vscode.CodeAction(
            `Fix: ${fix.description}`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();

        for (const replacement of fix.replacements) {
            const startPos = document.positionAt(replacement.offset_start);
            const endPos = document.positionAt(replacement.offset_end);
            const replaceRange = new vscode.Range(startPos, endPos);

            action.edit.replace(document.uri, replaceRange, replacement.new_text);
        }

        action.diagnostics = [diagnostic];
        return action;
    }

    private rangesOverlap(range1: vscode.Range, range2: vscode.Range): boolean {
        return range1.intersection(range2) !== undefined;
    }

    private rangesEqual(range1: vscode.Range, range2: vscode.Range): boolean {
        return range1.start.line === range2.start.line &&
               range1.start.character === range2.start.character &&
               range1.end.line === range2.end.line &&
               range1.end.character === range2.end.character;
    }
}
