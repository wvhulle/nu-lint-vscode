import * as vscode from 'vscode';
import { LegacyNuLintViolation } from './legacy';
import { VSCodeDiagnosticData } from './parsing';

export class NuLintCodeActionProvider implements vscode.CodeActionProvider {
    private readonly legacyViolations: Map<string, LegacyNuLintViolation[]> = new Map();
    private readonly vscodeData: Map<string, VSCodeDiagnosticData[]> = new Map();

    public updateViolations(uri: vscode.Uri, violations: LegacyNuLintViolation[]): void {
        this.legacyViolations.set(uri.toString(), violations);
        this.vscodeData.delete(uri.toString());
    }

    public updateVSCodeDiagnostics(uri: vscode.Uri, diagnostics: VSCodeDiagnosticData[]): void {
        this.vscodeData.set(uri.toString(), diagnostics);
        this.legacyViolations.delete(uri.toString());
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeAction[]> {
        const uriString = document.uri.toString();

        const vscodeDataList = this.vscodeData.get(uriString);
        if (vscodeDataList !== undefined) {
            return this.provideActionsFromVSCodeData(document, range, context, vscodeDataList);
        }

        const legacyViolations = this.legacyViolations.get(uriString) ?? [];
        return context.diagnostics
            .filter(diagnostic => diagnostic.source === 'nu-lint')
            .map(diagnostic => {
                const violation = this.findMatchingViolation(diagnostic, range, legacyViolations);
                return violation?.fix ? this.createLegacyFixAction(violation, document, diagnostic) : null;
            })
            .filter((action): action is vscode.CodeAction => action !== null);
    }

    private provideActionsFromVSCodeData(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        vscodeDataList: VSCodeDiagnosticData[]
    ): vscode.CodeAction[] {
        return context.diagnostics
            .filter(diagnostic => diagnostic.source === 'nu-lint')
            .map(diagnostic => {
                const matchingData = this.findMatchingVSCodeData(diagnostic, range, vscodeDataList);
                return matchingData?.code_action ? this.createVSCodeFixAction(matchingData, document.uri) : null;
            })
            .filter((action): action is vscode.CodeAction => action !== null);
    }

    private findMatchingViolation(
        diagnostic: vscode.Diagnostic,
        range: vscode.Range,
        fileViolations: LegacyNuLintViolation[]
    ): LegacyNuLintViolation | undefined {
        return fileViolations.find(v => {
            const violationRange = new vscode.Range(
                new vscode.Position(v.line_start - 1, v.column_start - 1),
                new vscode.Position(v.line_end - 1, v.column_end - 1)
            );

            return v.rule_id === diagnostic.code &&
                   this.rangesEqual(diagnostic.range, violationRange) &&
                   this.rangesOverlap(diagnostic.range, range);
        });
    }

    private createVSCodeFixAction(
        data: VSCodeDiagnosticData,
        uri: vscode.Uri
    ): vscode.CodeAction {
        const codeActionData = data.code_action;
        if (codeActionData === undefined) {
            throw new Error('Code action is required');
        }

        const action = new vscode.CodeAction(
            `Fix: ${codeActionData.title}`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();

        for (const edit of codeActionData.edits) {
            const replaceRange = new vscode.Range(
                new vscode.Position(edit.range.start.line, edit.range.start.character),
                new vscode.Position(edit.range.end.line, edit.range.end.character)
            );

            action.edit.replace(uri, replaceRange, edit.replacement_text);
        }

        return action;
    }

    private createLegacyFixAction(
        violation: LegacyNuLintViolation,
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction {
        const { fix } = violation;
        if (!fix) {
            throw new Error('Fix is required');
        }

        const action = new vscode.CodeAction(
            `Fix: ${fix.description}`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();
        action.diagnostics = [diagnostic];

        for (const replacement of fix.replacements) {
            const replaceRange = new vscode.Range(
                document.positionAt(replacement.offset_start),
                document.positionAt(replacement.offset_end)
            );
            action.edit.replace(document.uri, replaceRange, replacement.new_text);
        }

        return action;
    }

    private findMatchingVSCodeData(
        diagnostic: vscode.Diagnostic,
        range: vscode.Range,
        vscodeDataList: VSCodeDiagnosticData[]
    ): VSCodeDiagnosticData | undefined {
        return vscodeDataList.find(data => {
            const dataRange = new vscode.Range(
                new vscode.Position(data.range.start.line, data.range.start.character),
                new vscode.Position(data.range.end.line, data.range.end.character)
            );

            return data.code === diagnostic.code &&
                   this.rangesEqual(diagnostic.range, dataRange) &&
                   this.rangesOverlap(diagnostic.range, range);
        });
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
