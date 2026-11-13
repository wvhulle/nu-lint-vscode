import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveUserConfigDirectory, resolveUserConfigFile } from '../../src/user_config_location.ts';

describe('resolveUserConfigDirectory', () => {
    test('prefers an absolute XDG_CONFIG_HOME on Linux', () => {
        const configDirectory = resolveUserConfigDirectory({
            platform: 'linux',
            homeDirectory: '/home/alice',
            environmentVariables: { XDG_CONFIG_HOME: '/custom/config' },
        });
        assert.equal(configDirectory, '/custom/config');
    });

    test('ignores a relative XDG_CONFIG_HOME on Linux', () => {
        const configDirectory = resolveUserConfigDirectory({
            platform: 'linux',
            homeDirectory: '/home/alice',
            environmentVariables: { XDG_CONFIG_HOME: 'relative/config' },
        });
        assert.equal(configDirectory, '/home/alice/.config');
    });

    test('uses Application Support on macOS regardless of XDG', () => {
        const configDirectory = resolveUserConfigDirectory({
            platform: 'darwin',
            homeDirectory: '/Users/alice',
            environmentVariables: { XDG_CONFIG_HOME: '/custom/config' },
        });
        assert.equal(configDirectory, '/Users/alice/Library/Application Support');
    });

    test('uses APPDATA on Windows', () => {
        const configDirectory = resolveUserConfigDirectory({
            platform: 'win32',
            homeDirectory: 'C:\\Users\\alice',
            environmentVariables: { APPDATA: 'C:\\Users\\alice\\AppData\\Roaming' },
        });
        assert.equal(configDirectory, 'C:\\Users\\alice\\AppData\\Roaming');
    });

    test('gives up without a home directory', () => {
        const configDirectory = resolveUserConfigDirectory({
            platform: 'linux',
            homeDirectory: '',
            environmentVariables: {},
        });
        assert.equal(configDirectory, undefined);
    });
});

describe('resolveUserConfigFile', () => {
    test('joins nu-lint.toml with the platform separator', () => {
        assert.equal(
            resolveUserConfigFile({ platform: 'linux', homeDirectory: '/home/alice', environmentVariables: {} }),
            '/home/alice/.config/nu-lint.toml',
        );
        assert.equal(
            resolveUserConfigFile({
                platform: 'win32',
                homeDirectory: 'C:\\Users\\alice',
                environmentVariables: { APPDATA: 'C:\\Users\\alice\\AppData\\Roaming' },
            }),
            'C:\\Users\\alice\\AppData\\Roaming\\nu-lint.toml',
        );
    });
});
