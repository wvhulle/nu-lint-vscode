import { copyFile, mkdir } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const isWatchMode = process.argv.includes('--watch');
const isEndToEndBuild = process.argv.includes('--e2e');

const sharedBuildOptions = {
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    sourcemap: isWatchMode,
};

const extensionBuildOptions = {
    ...sharedBuildOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    minify: !isWatchMode,
};

const endToEndBuildOptions = {
    ...sharedBuildOptions,
    entryPoints: ['test/e2e/run_extension_suites.ts'],
    outfile: 'out/test/run_extension_suites.js',
    logOverride: { 'require-resolve-not-external': 'silent' },
};

const selectedBuildOptions = isEndToEndBuild ? endToEndBuildOptions : extensionBuildOptions;

if (isWatchMode) {
    const buildContext = await esbuild.context(selectedBuildOptions);
    await buildContext.watch();
} else {
    await esbuild.build(selectedBuildOptions);
}

if (isEndToEndBuild) {
    await mkdir('out/test', { recursive: true });
    await copyFile('test/e2e/language_server/legacy_nu_lint.sh', 'out/test/legacy_nu_lint.sh');
}
