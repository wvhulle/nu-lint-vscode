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
    private violations: Map<string, NuLintViolation[]> = new Map();

    public updateViolations(uri: vscode.Uri, violations: NuLintViolation[]) {
        this.violations.set(uri.toString(), violations);
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        const actions: vscode.CodeAction[] = [];
        const fileViolations = this.violations.get(document.uri.toString()) || [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'nu-lint') {
                continue;
            }

            const violation = fileViolations.find(v => {
                if (v.rule_id !== diagnostic.code) {
                    return false;
                }

                // Check if the diagnostic range matches the violation's reported location
                const violationRange = new vscode.Range(
                    new vscode.Position(v.line_start - 1, v.column_start - 1),
                    new vscode.Position(v.line_end - 1, v.column_end - 1)
                );

                const rangesMatch = this.rangesEqual(diagnostic.range, violationRange);
                const rangesOverlap = this.rangesOverlap(diagnostic.range, range);

                // Debug logging for development
                // console.log(`Matching violation ${v.rule_id}:`);
                // console.log(`  Diagnostic range: (${diagnostic.range.start.line + 1}, ${diagnostic.range.start.character + 1}) to (${diagnostic.range.end.line + 1}, ${diagnostic.range.end.character + 1})`);
                // console.log(`  Violation range: (${violationRange.start.line + 1}, ${violationRange.start.character + 1}) to (${violationRange.end.line + 1}, ${violationRange.end.character + 1})`);
                // console.log(`  Ranges match: ${rangesMatch}, Ranges overlap: ${rangesOverlap}`);

                return rangesMatch && rangesOverlap;
            });

            if (violation && violation.fix) {
                const action = new vscode.CodeAction(
                    `Fix: ${violation.fix.description}`,
                    vscode.CodeActionKind.QuickFix
                );

                action.edit = new vscode.WorkspaceEdit();

                for (const replacement of violation.fix.replacements) {
                    const startPos = document.positionAt(replacement.offset_start);
                    const endPos = document.positionAt(replacement.offset_end);
                    const replaceRange = new vscode.Range(startPos, endPos);

                    // Debug logging for development (uncomment if needed)
                    // console.log(`Fix for ${violation.rule_id} at violation location (${violation.line_start}, ${violation.column_start})`);
                    // console.log(`Replacement offset: ${replacement.offset_start}-${replacement.offset_end}`);
                    // console.log(`Replacement position: (${startPos.line + 1}, ${startPos.character + 1}) to (${endPos.line + 1}, ${endPos.character + 1})`);
                    // console.log(`Replacement text: "${replacement.new_text}"`);
                    // console.log(`Text being replaced: "${document.getText(replaceRange)}"`);

                    action.edit.replace(document.uri, replaceRange, replacement.new_text);
                }

                action.diagnostics = [diagnostic];
                actions.push(action);
            }
        }

        return actions;
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