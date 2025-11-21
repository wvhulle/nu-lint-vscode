import * as vscode from 'vscode';

export interface NuLintConfig {
    enable: boolean;
    executablePath: string;
    configPath: string;
    lintOnSave: boolean;
    lintOnOpen: boolean;
    lintOnType: boolean;
    fixOnSave: boolean;
}

export function getConfig(): NuLintConfig {
    const config = vscode.workspace.getConfiguration('nu-lint');
    return {
        enable: config.get('enable', true),
        executablePath: config.get('executablePath', 'nu-lint'),
        configPath: config.get('configPath', ''),
        lintOnSave: config.get('lintOnSave', true),
        lintOnOpen: config.get('lintOnOpen', true),
        lintOnType: config.get('lintOnType', false),
        fixOnSave: config.get('fixOnSave', false)
    };
}
