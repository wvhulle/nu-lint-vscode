# Nu-Lint

Linter for [Nu](https://www.nushell.sh/) shell scripts, provided through the language server of [nu-lint](https://codeberg.org/wvhulle/nu-lint).

This extension requires the [Nushell language extension](https://marketplace.visualstudio.com/items?itemName=TheNuProjectContributors.vscode-nushell-lang).

## Installation

1. Install nu-lint 1.7.0 or newer (1.10.0 or newer for the log settings), for example with `cargo install nu-lint`. See the [installation instructions](https://codeberg.org/wvhulle/nu-lint#installation) for other options. Older releases with a language server (0.0.62 and newer) still work in compatibility mode, and the extension shows a warning asking you to upgrade.
2. Install this extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=WillemVanhulle.nu-lint) or [Open VSX](https://open-vsx.org/extension/WillemVanhulle/nu-lint).
3. Open a Nushell (`.nu`) file.

## Features

- Diagnostics with links to the documentation of each rule
- Rule documentation on hover
- Quick fixes per violation, plus actions to ignore a violation on one line, ignore a rule in the whole file, or disable a rule in the user configuration
- Fix all auto-fixable problems with the **Nu-Lint: Fix All Auto-Fixable Problems** command, or on save:

  ```json
  "[nushell]": {
      "editor.codeActionsOnSave": { "source.fixAll": "explicit" }
  }
  ```

- **Nu-Lint: Open User Configuration** opens `nu-lint.toml`, creating it from `nu-lint config example` when it does not exist yet. Changes to the file are picked up immediately.
- **Nu-Lint: Restart Language Server**, also available from the language status item in the status bar

The user configuration lives in the configuration directory of your platform:

| Platform | Path |
|---|---|
| Linux | `$XDG_CONFIG_HOME/nu-lint.toml` or `~/.config/nu-lint.toml` |
| macOS | `~/Library/Application Support/nu-lint.toml` |
| Windows | `%APPDATA%\nu-lint.toml` |

## Settings

- `nu-lint.executablePath`: path to the nu-lint executable (default: `nu-lint`)
- `nu-lint.server.logLevel`: how much the language server logs to the **Nu-Lint** output channel (`off`, `error`, `warn` (default), `info`, `debug`, `trace`). Needs nu-lint 1.10.0 or newer.
- `nu-lint.server.logFile`: also append the language server logs to this file. Needs nu-lint 1.10.0 or newer.
- `nu-lint.trace.server`: trace the JSON-RPC messages between VS Code and the language server (`off`, `messages`, `verbose`)

**Nu-Lint: Show Logs** opens the output channel. Changing the executable path or a log setting restarts the language server.

## Alternative without this extension

[vscode-lspconfig](https://marketplace.visualstudio.com/items?itemName=whtsht.vscode-lspconfig) can start the language server directly:

```json
{
    "vscode-lspconfig.serverConfigurations": [
        {
            "name": "nu-lint",
            "document_selector": [{ "language": "nushell" }, { "language": "nu" }],
            "command": ["nu-lint", "lsp"]
        }
    ]
}
```

## License

MIT
