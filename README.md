# Nu-Lint

A simple AST-based linter for [Nu](https://www.nushell.sh/) shell scripts. See the repository of the underlying binary [nu-lint](https://github.com/wvhulle/nu-lint) for more information.

This extension works alongside:

- [NuShell language extension](vscode:extension/TheNuProjectContributors.vscode-nushell-lang) (required)
- [Nu Topiary formatter extension](vscode:extension/constneo.vscode-nushell-format) (optional)

WARNING: Most of the Typescript code was vibe-coded. Although it was tested manually in VS Code, it still needs a thorough human review. The underlying Rust code of the `nu-lint` project is by me as well, but has been reviewed better.

## Installation

1. Install the nu-lint binary using cargo: `cargo install nu-lint` (Cargo is installed with [rustup](https://rust-lang.github.io/rustup/installation/index.html))
2. Install this extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=WillemVanhulle.nu-lint)
3. Open a Nushell (.nu) file and save it.

## Configuration

Extension Settings:

- `nu-lint.enable`: Enable/disable nu-lint (default: true)
- `nu-lint.executablePath`: Path to nu-lint executable (default: "nu-lint")
- `nu-lint.configPath`: Path to custom configuration file (default: "")
- `nu-lint.lintOnSave`: Run nu-lint when file is saved (default: true)
- `nu-lint.lintOnOpen`: Run nu-lint when file is opened (default: true)
- `nu-lint.lintOnType`: Run nu-lint as you type (default: false)
- `nu-lint.fixOnSave`: Automatically apply fixes when file is saved (default: false)

## Commands

- `Nu-Lint: Lint Current File` - Lint the currently active Nushell file
- `Nu-Lint: Lint Workspace` - Lint all Nushell files in the workspace
- `Nu-Lint: Fix Current File` - Apply all available fixes to the currently active Nushell file
- `Nu-Lint: Show Logs` - Show the extension output logs for debugging

## License

MIT
