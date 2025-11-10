import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

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

interface NuLintOutput {
    violations: NuLintViolation[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
        files_checked: number;
    };
}

export class NuLinter implements vscode.Disposable {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private documentChangeListener: vscode.Disposable | undefined;
    private documentSaveListener: vscode.Disposable | undefined;
    private documentOpenListener: vscode.Disposable | undefined;
    private codeActionProvider: any;

    constructor(codeActionProvider?: any) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('nu-lint');
        this.codeActionProvider = codeActionProvider;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        const config = vscode.workspace.getConfiguration('nu-lint');

        if (config.get('lintOnType', false)) {
            this.documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.languageId === 'nushell' || event.document.languageId === 'nu') {
                    setTimeout(() => this.lintDocument(event.document), 500);
                }
            });
        }

        if (config.get('lintOnSave', true)) {
            this.documentSaveListener = vscode.workspace.onDidSaveTextDocument(document => {
                if (document.languageId === 'nushell' || document.languageId === 'nu') {
                    this.lintDocument(document);
                }
            });
        }

        if (config.get('lintOnOpen', true)) {
            this.documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
                if (document.languageId === 'nushell' || document.languageId === 'nu') {
                    this.lintDocument(document);
                }
            });
        }
    }

    public async lintDocument(document: vscode.TextDocument) {
        const config = vscode.workspace.getConfiguration('nu-lint');

        if (!config.get('enable', true)) {
            return;
        }

        try {
            const violations = await this.runNuLint(document.uri.fsPath);
            this.updateDiagnostics(document.uri, violations);
        } catch (error) {
            console.error('Error running nu-lint:', error);
            vscode.window.showErrorMessage(`Nu-Lint error: ${error}`);
        }
    }

    public async lintWorkspace() {
        const config = vscode.workspace.getConfiguration('nu-lint');

        if (!config.get('enable', true)) {
            return;
        }

        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showWarningMessage('No workspace folder found');
            return;
        }

        try {
            for (const folder of vscode.workspace.workspaceFolders) {
                const violations = await this.runNuLint(folder.uri.fsPath);
                this.updateDiagnosticsForWorkspace(violations);
            }
        } catch (error) {
            console.error('Error running nu-lint on workspace:', error);
            vscode.window.showErrorMessage(`Nu-Lint workspace error: ${error}`);
        }
    }

    private async runNuLint(filePath: string): Promise<NuLintViolation[]> {
        return new Promise((resolve, reject) => {
            const config = vscode.workspace.getConfiguration('nu-lint');
            const executable = config.get('executablePath', 'nu-lint');
            const configPath = config.get('configPath', '');

            // Find git root or workspace root for proper nu-lint context
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                reject(new Error('No workspace folder found'));
                return;
            }

            // Convert absolute path to relative path from workspace root
            const relativePath = path.relative(workspaceRoot, filePath);

            const args: string[] = ['-f', 'json'];
            if (configPath) {
                args.push('--config', configPath);
            }
            args.push(relativePath);

            const child = cp.spawn(executable, args, {
                cwd: workspaceRoot
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0 || code === 1) {
                    try {
                        const violations = this.parseNuLintJsonOutput(stdout, stderr);
                        resolve(violations);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse nu-lint output: ${parseError}`));
                    }
                } else {
                    reject(new Error(`nu-lint exited with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(new Error(`Failed to start nu-lint: ${error.message}`));
            });
        });
    }

    private parseNuLintJsonOutput(stdout: string, stderr: string): NuLintViolation[] {
        if (!stdout.trim()) {
            return [];
        }

        try {
            const output: NuLintOutput = JSON.parse(stdout);
            return output.violations || [];
        } catch (error) {
            console.error('Failed to parse nu-lint JSON output:', error);
            console.error('stdout:', stdout);
            console.error('stderr:', stderr);
            throw error;
        }
    }

    private updateDiagnostics(uri: vscode.Uri, violations: NuLintViolation[]) {
        const diagnostics: vscode.Diagnostic[] = [];
        const fileViolations: NuLintViolation[] = [];

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return;
        }

        for (const violation of violations) {
            // Convert violation file path to absolute path for comparison
            const violationAbsolutePath = path.isAbsolute(violation.file)
                ? violation.file
                : path.join(workspaceRoot, violation.file);

            if (path.resolve(violationAbsolutePath) === path.resolve(uri.fsPath)) {
                fileViolations.push(violation);

                const range = new vscode.Range(
                    new vscode.Position(violation.line_start - 1, violation.column_start - 1),
                    new vscode.Position(violation.line_end - 1, violation.column_end - 1)
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `${violation.message} (${violation.rule_id})`,
                    this.getSeverity(violation.severity)
                );
                diagnostic.source = 'nu-lint';
                diagnostic.code = violation.rule_id;

                if (violation.suggestion) {
                    diagnostic.relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(uri, range),
                            violation.suggestion
                        )
                    ];
                }

                diagnostics.push(diagnostic);
            }
        }

        this.diagnosticCollection.set(uri, diagnostics);

        // Update code action provider with violations
        if (this.codeActionProvider) {
            this.codeActionProvider.updateViolations(uri, fileViolations);
        }
    }

    private updateDiagnosticsForWorkspace(violations: NuLintViolation[]) {
        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        if (!workspaceRoot) {
            return;
        }

        for (const violation of violations) {
            // Convert violation file path to absolute path
            const violationAbsolutePath = path.isAbsolute(violation.file)
                ? violation.file
                : path.join(workspaceRoot, violation.file);

            const uri = vscode.Uri.file(violationAbsolutePath);
            const diagnostics = diagnosticsByFile.get(violationAbsolutePath) || [];

            const range = new vscode.Range(
                new vscode.Position(violation.line_start - 1, violation.column_start - 1),
                new vscode.Position(violation.line_end - 1, violation.column_end - 1)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                `${violation.message} (${violation.rule_id})`,
                this.getSeverity(violation.severity)
            );
            diagnostic.source = 'nu-lint';
            diagnostic.code = violation.rule_id;

            if (violation.suggestion) {
                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(uri, range),
                        violation.suggestion
                    )
                ];
            }

            diagnostics.push(diagnostic);
            diagnosticsByFile.set(violationAbsolutePath, diagnostics);
        }

        for (const [file, diagnostics] of diagnosticsByFile) {
            const uri = vscode.Uri.file(file);
            this.diagnosticCollection.set(uri, diagnostics);
        }
    }

    private getSeverity(severity: string): vscode.DiagnosticSeverity {
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

    public dispose() {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.documentChangeListener?.dispose();
        this.documentSaveListener?.dispose();
        this.documentOpenListener?.dispose();
    }
}