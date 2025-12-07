import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    minify: true,
};

if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
} else {
    await esbuild.build(config);
}
