import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    MINIMUM_VERSION_WITH_LSP_SUBCOMMAND,
    classifyVersionOutput,
    formatSemanticVersion,
    isVersionAtLeast,
    parseNuLintVersionOutput,
} from '../../src/server_version_check.ts';

describe('parseNuLintVersionOutput', () => {
    test('reads the clap version line', () => {
        assert.deepEqual(parseNuLintVersionOutput('nu-lint 1.9.1\n'), { major: 1, minor: 9, patch: 1 });
    });

    test('ignores pre-release suffixes', () => {
        assert.deepEqual(parseNuLintVersionOutput('nu-lint 2.0.0-rc.1'), { major: 2, minor: 0, patch: 0 });
    });

    test('rejects output without a version', () => {
        assert.equal(parseNuLintVersionOutput('error: unexpected argument'), undefined);
        assert.equal(parseNuLintVersionOutput(''), undefined);
    });
});

describe('isVersionAtLeast', () => {
    const minimumVersion = { major: 1, minor: 7, patch: 0 };

    test('accepts equal versions', () => {
        assert.equal(isVersionAtLeast({ major: 1, minor: 7, patch: 0 }, minimumVersion), true);
    });

    test('compares major before minor before patch', () => {
        assert.equal(isVersionAtLeast({ major: 2, minor: 0, patch: 0 }, minimumVersion), true);
        assert.equal(isVersionAtLeast({ major: 1, minor: 8, patch: 0 }, minimumVersion), true);
        assert.equal(isVersionAtLeast({ major: 1, minor: 6, patch: 99 }, minimumVersion), false);
        assert.equal(isVersionAtLeast({ major: 0, minor: 99, patch: 99 }, minimumVersion), false);
    });
});

describe('classifyVersionOutput', () => {
    test('marks releases with only the lsp flag as legacy', () => {
        assert.equal(classifyVersionOutput('nu-lint 0.0.62').outcome, 'legacy');
        assert.equal(classifyVersionOutput('nu-lint 1.6.9').outcome, 'legacy');
    });

    test('marks releases without a language server as outdated', () => {
        assert.equal(classifyVersionOutput('nu-lint 0.0.61').outcome, 'outdated');
    });

    test('marks releases with the lsp subcommand as current', () => {
        const minimumVersionOutput = `nu-lint ${formatSemanticVersion(MINIMUM_VERSION_WITH_LSP_SUBCOMMAND)}`;
        assert.equal(classifyVersionOutput(minimumVersionOutput).outcome, 'current');
    });

    test('keeps unparseable output for diagnostics', () => {
        assert.deepEqual(classifyVersionOutput('garbage'), { outcome: 'unrecognized', versionOutput: 'garbage' });
    });
});
