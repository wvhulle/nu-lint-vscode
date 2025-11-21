import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { getConfig } from './config';
import { LegacyNuLintViolation, runNuLintLegacyFormat, processLegacyViolations } from './legacy';
import { detectNuLintFormat, getNuLintVersion } from './execution';
import { VSCodeLintOutput, VSCodeDiagnosticData } from './parsing';
import { resolveViolationPath, createVSCodeDiagnostic } from './diagnostic-utils';


interface CodeActionProvider {
    updateViolations(uri: vscode.Uri, violations: LegacyNuLintViolation[]): void;
    updateVSCodeDiagnostics(uri: vscode.Uri, diagnostics: VSCodeDiagnosticData[]): void;
}

export class NuLinter implements vscode.Disposable {
    private readonly diagnosticCollection: vscode.DiagnosticCollection;
    private documentChangeListener: vscode.Disposable | undefined;
    private documentSaveListener: vscode.Disposable | undefined;
    private documentOpenListener: vscode.Disposable | undefined;
    private readonly codeActionProvider: CodeActionProvider | undefined;
    private readonly activeLints: Set<string> = new Set();
    private readonly logger: vscode.LogOutputChannel;
    private nuLintVersion: string | null = null;

    public constructor(codeActionProvider?: CodeActionProvider, logger?: vscode.LogOutputChannel) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('nu-lint');
        this.codeActionProvider = codeActionProvider;
        this.logger = logger ?? vscode.window.createOutputChannel('Nu-Lint', { log: true });
        void this.initializeNuLint();
        this.setupEventListeners();
    }

    private isNushellDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'nu' || document.languageId === 'nushell';
    }

    private async initializeNuLint(): Promise<void> {
        try {
            const config = getConfig();
            this.nuLintVersion = await getNuLintVersion(config.executablePath);
            this.logger.info(`Detected nu-lint version: ${this.nuLintVersion}`);
        } catch (error: unknown) {
            this.logger.warn(`Failed to detect nu-lint version: ${String(error)}`);
            this.nuLintVersion = null;
        }
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
            if (!this.isNushellDocument(event.document)) {
                return;
            }
            this.logger.debug(`Document changed: ${event.document.fileName}`);
            setTimeout(() => {
                void this.lintDocument(event.document);
            }, 500);
        });
    }

    private setupOnSaveListener(): void {
        this.documentSaveListener = vscode.workspace.onDidSaveTextDocument(document => {
            if (!this.isNushellDocument(document)) {
                return;
            }
            this.logger.info(`Linting saved Nushell file: ${document.fileName}`);
            void this.lintDocument(document);
        });
    }

    private setupOnOpenListener(): void {
        this.documentOpenListener = vscode.workspace.onDidOpenTextDocument(document => {
            if (!this.isNushellDocument(document)) {
                return;
            }
            this.logger.info(`Linting opened Nushell file: ${document.fileName}`);
            void this.lintDocument(document);
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
            await this.runNuLintAndUpdateDiagnostics(document);
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
        const format = detectNuLintFormat(this.nuLintVersion);

        for (const fileUri of nuFiles) {
            try {
                if (format === 'vscode-json') {
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    await this.runNuLintVSCodeFormatDirect(document);
                } else {
                    const violations = await runNuLintLegacyFormat(fileUri.fsPath, this.logger);
                    this.updateDiagnostics(fileUri, violations);
                }
            } catch (error: unknown) {
                this.logger.error(`Error linting ${fileUri.fsPath}: ${String(error)}`);
            }
        }

        void vscode.window.showInformationMessage(`Workspace linting complete. Checked ${nuFiles.length} files.`);
    }

    private async runNuLintAndUpdateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const format = detectNuLintFormat(this.nuLintVersion);

        if (format === 'vscode-json') {
            await this.runNuLintVSCodeFormatDirect(document);
        } else {
            const violations = await runNuLintLegacyFormat(document.uri.fsPath, this.logger);
            this.logger.info(`Found ${violations.length} violations in ${document.uri.fsPath}`);
            this.updateDiagnostics(document.uri, violations);
        }
    }


    private async runNuLintVSCodeFormatDirect(document: vscode.TextDocument): Promise<void> {
        const config = getConfig();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const filePath = document.uri.fsPath;

        const cwd = workspaceRoot ?? path.dirname(filePath);
        const targetPath = workspaceRoot !== undefined ? path.relative(workspaceRoot, filePath) : filePath;

        const args: string[] = ['-f', 'vscode-json'];

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
                this.handleVSCodeDirectProcessClose(code, stdout, stderr, resolve, reject, document);
            });

            child.on('error', (error: Error) => {
                this.logger.error(`Failed to start nu-lint: ${error.message}`);
                reject(new Error(`Failed to start nu-lint: ${error.message}`));
            });
        });
    }

    private handleVSCodeDirectProcessClose(
        code: number | null,
        stdout: string,
        stderr: string,
        resolve: () => void,
        reject: (reason: Error) => void,
        document: vscode.TextDocument
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
                this.applyVSCodeJsonDirectly(stdout, document);
                resolve();
            } catch (parseError: unknown) {
                this.logger.error(`Failed to parse nu-lint vscode-json output: ${String(parseError)}`);
                reject(new Error(`Failed to parse nu-lint vscode-json output: ${String(parseError)}`));
            }
            return;
        }

        this.logger.error(`nu-lint exited with code ${String(code)}: ${stderr}`);
        reject(new Error(`nu-lint exited with code ${String(code)}: ${stderr}`));
    }

    private applyVSCodeJsonDirectly(stdout: string, document: vscode.TextDocument): void {
        if (stdout.trim().length === 0) {
            this.diagnosticCollection.set(document.uri, []);
            return;
        }

        const output = JSON.parse(stdout) as VSCodeLintOutput;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const result = this.processVSCodeDiagnostics(output, document, workspaceRoot);

        this.diagnosticCollection.set(document.uri, result.diagnostics);

        if (this.codeActionProvider !== undefined) {
            this.codeActionProvider.updateVSCodeDiagnostics(document.uri, result.vscodeData);
        }

        this.logger.info(`Found ${result.diagnostics.length} diagnostics in ${document.uri.fsPath}`);
    }

    private processVSCodeDiagnostics(
        output: VSCodeLintOutput,
        document: vscode.TextDocument,
        workspaceRoot: string | undefined
    ): { diagnostics: vscode.Diagnostic[]; vscodeData: VSCodeDiagnosticData[] } {
        const results = Object.entries(output.diagnostics)
            .filter(([file]) => path.resolve(resolveViolationPath(file, workspaceRoot)) === path.resolve(document.uri.fsPath))
            .flatMap(([, vscodeDiagnostics]) => 
                vscodeDiagnostics.map(vscodeDiagnostic => ({
                    diagnostic: createVSCodeDiagnostic(vscodeDiagnostic, workspaceRoot),
                    data: vscodeDiagnostic
                }))
            );

        return {
            diagnostics: results.map(r => r.diagnostic),
            vscodeData: results.map(r => r.data)
        };
    }



    private updateDiagnostics(uri: vscode.Uri | null, violations: LegacyNuLintViolation[]): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        const result = processLegacyViolations(violations, uri, workspaceRoot);

        this.applyDiagnostics(result.diagnosticsByFile, result.violationsByFile);
    }


    private applyDiagnostics(
        diagnosticsByFile: Map<string, vscode.Diagnostic[]>,
        violationsByFile: Map<string, LegacyNuLintViolation[]>
    ): void {
        for (const [file, diagnostics] of diagnosticsByFile) {
            const fileUri = vscode.Uri.file(file);
            this.diagnosticCollection.set(fileUri, diagnostics);

            this.codeActionProvider?.updateViolations(fileUri, violationsByFile.get(file) ?? []);
        }
    }


    public dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.documentChangeListener?.dispose();
        this.documentSaveListener?.dispose();
        this.documentOpenListener?.dispose();
    }
}
