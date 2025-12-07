# Nu-Lint

A simple AST-based linter for [Nu](https://www.nushell.sh/) shell scripts via LSP. See the repository of the underlying binary [nu-lint](https://github.com/wvhulle/nu-lint) for more information.

This extension works alongside:

- [NuShell language extension](vscode:extension/TheNuProjectContributors.vscode-nushell-lang) (required)

## Installation

1. Install the nu-lint binary using cargo: `cargo install nu-lint` (Cargo is installed with [rustup](https://rust-lang.github.io/rustup/installation/index.html))
2. Install this extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=WillemVanhulle.nu-lint)
3. Open a Nushell (.nu) file - diagnostics and code actions are provided automatically via LSP.

## Configuration

Extension Settings:

- `nu-lint.executablePath`: Path to nu-lint executable (default: "nu-lint")

## Alternative: No Extension

You can also use [vscode-lspconfig](https://marketplace.visualstudio.com/items?itemName=whtsht.vscode-lspconfig) instead of this extension:

```json
// .vscode/settings.json
{
    "vscode-lspconfig.serverConfigurations": [
        {
            "name": "nu-lint",
            "document_selector": [{"language": "nushell"}, {"language": "nu"}],
            "command": ["nu-lint", "--lsp"]
        }
    ]
}
```

## License

MIT
