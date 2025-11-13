import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { getConfig } from './config';

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

interface CodeActionProvider {
    updateViolations(uri: vscode.Uri, violations: NuLintViolation[]): void;
}

export class NuLinter implements vscode.Disposable {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private documentChangeListener: vscode.Disposable | undefined;
    private documentSaveListener: vscode.Disposable | undefined;
    private documentOpenListener: vscode.Disposable | undefined;
    private readonly codeActionProvider: CodeActionProvider | undefined;
    private readonly activeLints: Set<string> = new Set();
    private readonly logger: vscode.LogOutputChannel;

    private static readonly severityMap = new Map<string, vscode.DiagnosticSeverity>([
        ['error', vscode.DiagnosticSeverity.Error],
        ['warning', vscode.DiagnosticSeverity.Warning],
        ['info', vscode.DiagnosticSeverity.Information]
    ]);

    public constructor(codeActionProvider?: CodeActionProvider, logger?: vscode.LogOutputChannel) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('nu-lint');
        this.codeActionProvider = codeActionProvider;
        this.logger = logger ?? vscode.window.createOutputChannel('Nu-Lint', { log: true });
        this.setupEventListeners();
    }

    private isNushellDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'nu' || document.languageId === 'nushell';
    }

    private setupEventListeners(): void {
        const config = getConfig();
        this.logger.info(`Setting up event listeners: lintOnType=${config.lintOnType}, lintOnSave=${config.lintOnSave}, lintOnOpen=${config.lintOnOpen}`);

        if (config.lintOnType) {
            this.setupOnTypeListener();
        }

        if (config.lintOnSave) {
            this.setupOnSaveListener();
        }

        if (config.lintOnOpen) {
            this.setupOnOpenListener();
        }
    }

    private setupOnTypeListener(): void {
        this.documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (this.isNushellDocument(event.document)) {
                this.logger.debug(`Document changed: ${event.document.fileName}`);
                setTimeout(() => {
                    void this.lintDocument(event.document);
                }, 500);
            }
        });
    }

    private setupOnSaveListener(): void {
        this.documentSaveListener = vscode.workspace.onDidSaveTextDocument(document => {
            if (this.isNushellDocument(document)) {
                this.logger.info(`Linting saved Nushell file: ${document.fileName}`);
                void this.lintDocument(document);
            }
        });
    }

    private setupOnOpenListener(): void {
        this.documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
            if (this.isNushellDocument(document)) {
                this.logger.info(`Linting opened Nushell file: ${document.fileName}`);
                void this.lintDocument(document);
            }
        });
    }

    public async lintDocument(document: vscode.TextDocument): Promise<void> {
        if (document.uri.scheme !== 'file') {
            this.logger.debug(`Skipping non-file URI: ${document.uri.toString()}`);
            return;
        }

        const filePath = document.uri.fsPath;
        this.logger.debug(`lintDocument called for: ${filePath}`);

        if (this.activeLints.has(filePath)) {
            this.logger.debug(`Linting already in progress for: ${filePath}`);
            return;
        }

        if (filePath.includes('.git')) {
            this.logger.debug(`Skipping file with .git in path: ${filePath}`);
            return;
        }

        const config = getConfig();
        if (!config.enable) {
            this.logger.debug('Nu-lint is disabled in configuration');
            return;
        }

        this.activeLints.add(filePath);
        this.logger.info(`Starting nu-lint for: ${filePath}`);

        try {
            const violations = await this.runNuLint(filePath);
            this.logger.info(`Found ${violations.length} violations in ${filePath}`);
            this.updateDiagnostics(document.uri, violations);
        } catch (error: unknown) {
            this.logger.error(`Nu-Lint error: ${String(error)}`);
            void vscode.window.showErrorMessage(`Nu-Lint error: ${String(error)}`);
        } finally {
            this.activeLints.delete(filePath);
        }
    }

    public async lintWorkspace(): Promise<void> {
        const config = getConfig();
        if (!config.enable) {
            return;
        }

        try {
            await this.lintWorkspaceFiles();
        } catch (error: unknown) {
            void vscode.window.showErrorMessage(`Nu-Lint workspace error: ${String(error)}`);
        }
    }

    private async lintWorkspaceFiles(): Promise<void> {
        const allFiles = await vscode.workspace.findFiles('**/*.nu', '**/node_modules/**');
        const nuFiles = allFiles.filter(uri => uri.scheme === 'file');
        
        if (nuFiles.length === 0) {
            void vscode.window.showInformationMessage('No .nu files found in workspace');
            return;
        }

        this.logger.info(`Linting ${nuFiles.length} files in workspace`);

        for (const fileUri of nuFiles) {
            try {
                const violations = await this.runNuLint(fileUri.fsPath);
                this.updateDiagnostics(fileUri, violations);
            } catch (error: unknown) {
                this.logger.error(`Error linting ${fileUri.fsPath}: ${String(error)}`);
            }
        }

        void vscode.window.showInformationMessage(`Workspace linting complete. Checked ${nuFiles.length} files.`);
    }

    private async runNuLint(filePath: string): Promise<NuLintViolation[]> {
        const config = getConfig();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const cwd = workspaceRoot ?? path.dirname(filePath);
        const targetPath = workspaceRoot !== undefined ? path.relative(workspaceRoot, filePath) : filePath;

        const args: string[] = ['-f', 'json'];

        if (config.configPath.length > 0) {
            args.push('--config', config.configPath);
        }
        args.push(targetPath);

        this.logger.debug(`Running: ${config.executablePath} ${args.join(' ')}`);
        this.logger.debug(`Working directory: ${cwd}`);

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
                this.handleProcessClose(code, stdout, stderr, resolve, reject);
            });

            child.on('error', (error: Error) => {
                this.logger.error(`Failed to start nu-lint: ${error.message}`);
                reject(new Error(`Failed to start nu-lint: ${error.message}`));
            });
        });
    }

    private handleProcessClose(
        code: number | null,
        stdout: string,
        stderr: string,
        resolve: (value: NuLintViolation[]) => void,
        reject: (reason: Error) => void
    ): void {
        this.logger.debug(`nu-lint process exited with code: ${String(code)}`);
        if (stdout.length > 0) {
            this.logger.trace(`stdout: ${stdout}`);
        }
        if (stderr.length > 0) {
            this.logger.trace(`stderr: ${stderr}`);
        }

        if (code === 0 || code === 1) {
            try {
                const violations = this.parseNuLintJsonOutput(stdout);
                resolve(violations);
            } catch (parseError: unknown) {
                this.logger.error(`Failed to parse nu-lint output: ${String(parseError)}`);
                reject(new Error(`Failed to parse nu-lint output: ${String(parseError)}`));
            }
            return;
        }

        this.logger.error(`nu-lint exited with code ${String(code)}: ${stderr}`);
        reject(new Error(`nu-lint exited with code ${String(code)}: ${stderr}`));
    }

    private parseNuLintJsonOutput(stdout: string): NuLintViolation[] {
        if (stdout.trim().length === 0) {
            return [];
        }

        const output = JSON.parse(stdout) as NuLintOutput;
        return output.violations ?? [];
    }

    private updateDiagnostics(uri: vscode.Uri | null, violations: NuLintViolation[]): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();
        const violationsByFile = new Map<string, NuLintViolation[]>();

        for (const violation of violations) {
            this.processViolation(violation, uri, workspaceRoot, diagnosticsByFile, violationsByFile);
        }

        this.applyDiagnostics(diagnosticsByFile, violationsByFile);
    }

    private processViolation(
        violation: NuLintViolation,
        uri: vscode.Uri | null,
        workspaceRoot: string | undefined,
        diagnosticsByFile: Map<string, vscode.Diagnostic[]>,
        violationsByFile: Map<string, NuLintViolation[]>
    ): void {
        const violationAbsolutePath = this.resolveViolationPath(violation.file, workspaceRoot);

        if (uri !== null && path.resolve(violationAbsolutePath) !== path.resolve(uri.fsPath)) {
            return;
        }

        const fileUri = vscode.Uri.file(violationAbsolutePath);
        const diagnostics = diagnosticsByFile.get(violationAbsolutePath) ?? [];
        const fileViolations = violationsByFile.get(violationAbsolutePath) ?? [];

        const diagnostic = this.createDiagnostic(violation, fileUri);

        diagnostics.push(diagnostic);
        fileViolations.push(violation);
        diagnosticsByFile.set(violationAbsolutePath, diagnostics);
        violationsByFile.set(violationAbsolutePath, fileViolations);
    }

    private resolveViolationPath(violationFile: string, workspaceRoot: string | undefined): string {
        return path.isAbsolute(violationFile) ? violationFile : path.join(workspaceRoot ?? '', violationFile);
    }

    private createDiagnostic(violation: NuLintViolation, fileUri: vscode.Uri): vscode.Diagnostic {
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

    private applyDiagnostics(
        diagnosticsByFile: Map<string, vscode.Diagnostic[]>,
        violationsByFile: Map<string, NuLintViolation[]>
    ): void {
        for (const [file, diagnostics] of diagnosticsByFile) {
            const fileUri = vscode.Uri.file(file);
            this.diagnosticCollection.set(fileUri, diagnostics);

            if (this.codeActionProvider !== undefined) {
                const fileViolations = violationsByFile.get(file) ?? [];
                this.codeActionProvider.updateViolations(fileUri, fileViolations);
            }
        }
    }

    private getSeverity(severity: string): vscode.DiagnosticSeverity {
        return NuLinter.severityMap.get(severity) ?? vscode.DiagnosticSeverity.Warning;
    }

    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.documentChangeListener?.dispose();
        this.documentSaveListener?.dispose();
        this.documentOpenListener?.dispose();
    }
}
