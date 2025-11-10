# Nu-Lint VSCode Extension

A Visual Studio Code extension that integrates the [nu-lint](https://github.com/wvhulle/nu-lint) linter for Nushell scripts.


## Installation

1. Install nu-lint: `cargo install nu-lint`
2. Install this extension from the VSCode marketplace
3. Open a Nushell (.nu) file and start coding!

## Configuration

Extension Settings:

- `nu-lint.enable`: Enable/disable nu-lint (default: true)
- `nu-lint.executablePath`: Path to nu-lint executable (default: "nu-lint")
- `nu-lint.configPath`: Path to custom configuration file (default: "")
- `nu-lint.lintOnSave`: Run nu-lint when file is saved (default: true)
- `nu-lint.lintOnOpen`: Run nu-lint when file is opened (default: true)
- `nu-lint.lintOnType`: Run nu-lint as you type (default: false)


Create a `.nu-lint.toml` file in your project root to configure linting rules:

```toml
min_severity = "warning"

[rules]
prefer_pipeline_input = "error"
```

## Commands

- `Nu-Lint: Lint Current File` - Lint the currently active Nushell file
- `Nu-Lint: Lint Workspace` - Lint all Nushell files in the workspace


## License

MIT