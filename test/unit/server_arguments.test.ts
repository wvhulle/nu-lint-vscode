import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseServerLogLevel, planServerLaunch } from '../../src/server_arguments.ts';

const DEFAULT_LOG_SETTINGS = { logLevel: 'warn', logFile: '' } as const;
const VERSION_WITH_LOG_FLAGS = { outcome: 'current', installedVersion: { major: 1, minor: 10, patch: 0 } } as const;
const VERSION_WITHOUT_LOG_FLAGS = { outcome: 'current', installedVersion: { major: 1, minor: 9, patch: 2 } } as const;
const LEGACY_VERSION = { outcome: 'legacy', installedVersion: { major: 1, minor: 6, patch: 0 } } as const;

describe('parseServerLogLevel', () => {
    test('accepts known levels', () => {
        assert.equal(parseServerLogLevel('debug'), 'debug');
    });

    test('falls back to warn for unknown values', () => {
        assert.equal(parseServerLogLevel('verbose'), 'warn');
        assert.equal(parseServerLogLevel(undefined), 'warn');
    });
});

describe('planServerLaunch', () => {
    test('passes level and file to servers that support log flags', () => {
        assert.deepEqual(planServerLaunch(VERSION_WITH_LOG_FLAGS, { logLevel: 'debug', logFile: ' /tmp/lsp.log ' }), {
            compatibility: 'full',
            commandArguments: ['lsp', '--log-level', 'debug', '--log-file', '/tmp/lsp.log'],
        });
    });

    test('omits the log file flag when no file is configured', () => {
        assert.deepEqual(planServerLaunch(VERSION_WITH_LOG_FLAGS, DEFAULT_LOG_SETTINGS), {
            compatibility: 'full',
            commandArguments: ['lsp', '--log-level', 'warn'],
        });
    });

    test('uses the lsp subcommand without log flags before 1.10', () => {
        assert.deepEqual(planServerLaunch(VERSION_WITHOUT_LOG_FLAGS, DEFAULT_LOG_SETTINGS), {
            compatibility: 'full',
            commandArguments: ['lsp'],
        });
    });

    test('reports custom log settings that the installed server cannot honour', () => {
        assert.deepEqual(planServerLaunch(VERSION_WITHOUT_LOG_FLAGS, { logLevel: 'debug', logFile: '' }), {
            compatibility: 'log-settings-ignored',
            commandArguments: ['lsp'],
        });
    });

    test('falls back to the legacy flag before the lsp subcommand existed', () => {
        assert.deepEqual(planServerLaunch(LEGACY_VERSION, { logLevel: 'debug', logFile: '/tmp/lsp.log' }), {
            compatibility: 'legacy-lsp-flag',
            commandArguments: ['--lsp'],
        });
    });

    test('uses the flag every server version understands when the version is unknown', () => {
        assert.deepEqual(planServerLaunch({ outcome: 'unrecognized', versionOutput: '?' }, DEFAULT_LOG_SETTINGS), {
            compatibility: 'unknown-version',
            commandArguments: ['--lsp'],
        });
    });
});
