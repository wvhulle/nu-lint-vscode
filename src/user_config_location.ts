import { posix, win32 } from 'node:path';

export interface ConfigLocationEnvironment {
    readonly platform: NodeJS.Platform;
    readonly homeDirectory: string;
    readonly environmentVariables: Readonly<Record<string, string | undefined>>;
}

export const USER_CONFIG_FILE_NAME = 'nu-lint.toml';

export function resolveUserConfigDirectory(locationEnvironment: ConfigLocationEnvironment): string | undefined {
    const { platform, homeDirectory, environmentVariables } = locationEnvironment;
    if (platform === 'win32') {
        const roamingAppData = environmentVariables.APPDATA;
        return roamingAppData && win32.isAbsolute(roamingAppData) ? roamingAppData : undefined;
    }
    if (!homeDirectory) {
        return undefined;
    }
    if (platform === 'darwin') {
        return posix.join(homeDirectory, 'Library', 'Application Support');
    }
    const xdgConfigHome = environmentVariables.XDG_CONFIG_HOME;
    if (xdgConfigHome && posix.isAbsolute(xdgConfigHome)) {
        return xdgConfigHome;
    }
    return posix.join(homeDirectory, '.config');
}

export function resolveUserConfigFile(locationEnvironment: ConfigLocationEnvironment): string | undefined {
    const configDirectory = resolveUserConfigDirectory(locationEnvironment);
    if (configDirectory === undefined) {
        return undefined;
    }
    const platformPath = locationEnvironment.platform === 'win32' ? win32 : posix;
    return platformPath.join(configDirectory, USER_CONFIG_FILE_NAME);
}
