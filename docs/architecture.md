# Architecture

The extension is a thin client. All linting, fixes, hover documentation and rule configuration live in the nu-lint language server. The extension finds a usable `nu-lint` binary, starts it with the right arguments, forwards events VS Code would not send on its own, and adds a few commands on top.

## Components

```mermaid
flowchart LR
    editor["VS Code editor<br/>.nu files"]

    subgraph extension["nu-lint extension"]
        commands["Commands"] --> controller["LanguageServerController"]
        controller --> statusItem["Language status item"]
        controller --> languageClient["vscode-languageclient"]
        configWatcher["nu-lint.toml watcher"] --> languageClient
        outputChannel["Nu-Lint output channel"]
    end

    subgraph server["nu-lint lsp process"]
        lspServer["Language server"] --> userConfig[("nu-lint.toml")]
        lspServer --> logFile[("log file, optional")]
    end

    editor <--> languageClient
    languageClient <-- "JSON-RPC over stdio" --> lspServer
    lspServer -. "stderr logs" .-> outputChannel
```

VS Code only sends document events for files that match the extension's document selector, so the server would never learn that `nu-lint.toml` changed. The extension watches that file itself and forwards each change as `workspace/didChangeWatchedFiles`. The server then reloads the configuration and lints every open document again.

## Source modules

Pure logic lives in modules without a `vscode` import, so the Node.js test runner can unit test it. `extension.ts` wires them to the VS Code API.

```mermaid
flowchart TD
    extensionModule["extension.ts<br/>activation, controller, commands"]
    versionModule["server_version_check.ts<br/>run --version, classify the release"]
    argumentsModule["server_arguments.ts<br/>choose arguments and compatibility"]
    configLocationModule["user_config_location.ts<br/>platform config directory"]

    extensionModule --> versionModule
    extensionModule --> argumentsModule
    extensionModule --> configLocationModule
    argumentsModule --> versionModule
```

| Module | Input | Output |
|---|---|---|
| `server_version_check.ts` | output of `nu-lint --version` | `current`, `legacy`, `outdated`, `unrecognized` or `missing` |
| `server_arguments.ts` | a launchable version and the log settings | command arguments and a compatibility level |
| `user_config_location.ts` | platform, home directory and environment | path of `nu-lint.toml`, matching the `dirs` crate nu-lint uses |

## Startup

```mermaid
sequenceDiagram
    participant VSCode as VS Code
    participant Controller as LanguageServerController
    participant Binary as nu-lint binary
    participant Client as vscode-languageclient
    participant Server as nu-lint lsp

    VSCode->>Controller: activate (a .nu file is opened)
    Controller->>Binary: nu-lint --version
    Binary-->>Controller: "nu-lint 1.9.2"
    Controller->>Controller: classify version and plan launch arguments
    alt missing or without a language server
        Controller-->>VSCode: error notification and status "nu-lint unavailable"
    else launchable
        Controller->>Client: start(command, arguments)
        Client->>Server: spawn and initialize
        Server-->>Client: capabilities
        Client->>Server: didOpen for open .nu documents
        Server-->>Client: publishDiagnostics
        Client-->>VSCode: diagnostics, hover, code actions
    end
```

Restarts go through one queue, so a quick series of setting changes never leaves two servers running.

## Compatibility with older nu-lint releases

```mermaid
flowchart TD
    probe["nu-lint --version"] --> failed{"Did it run?"}
    failed -- no --> missing["Error: install nu-lint"]
    failed -- yes --> parsed{"Version parsed?"}
    parsed -- no --> unknown["nu-lint --lsp<br/>warning: unknown version"]
    parsed -- yes --> newEnough{"At least 0.0.62?"}
    newEnough -- no --> outdated["Error: no language server, upgrade"]
    newEnough -- yes --> subcommand{"At least 1.7.0?"}
    subcommand -- no --> legacy["nu-lint --lsp<br/>warning: upgrade"]
    subcommand -- yes --> logFlags{"At least 1.10.0?"}
    logFlags -- yes --> full["nu-lint lsp --log-level ... --log-file ..."]
    logFlags -- no --> customLogs{"Custom log settings?"}
    customLogs -- no --> plain["nu-lint lsp"]
    customLogs -- yes --> ignored["nu-lint lsp<br/>warning: log settings ignored"]
```

Each warning appears once per session. While a server runs in a reduced mode, the language status item turns yellow and its detail shows the warning.

## Configuration reload

```mermaid
sequenceDiagram
    participant User
    participant Watcher as File watcher
    participant Controller as LanguageServerController
    participant Server as nu-lint lsp

    User->>User: edit and save nu-lint.toml (or another program writes it)
    Watcher->>Controller: onDidChange(nu-lint.toml)
    Controller->>Server: workspace/didChangeWatchedFiles
    Server->>Server: reload configuration
    Server-->>Controller: publishDiagnostics for every open document
```

The *disable rule* code action takes another path: the server writes `nu-lint.toml` itself and reloads right away.

## Build and tests

```mermaid
flowchart LR
    subgraph inputs["Flake inputs"]
        nixpkgs["nixpkgs"]
        nuLintInput["nu-lint flake<br/>binary and assets/logo.svg"]
    end

    pnpmDeps["fetchPnpmDeps<br/>pnpm-lock.yaml"]
    extensionBuild["extensionBuild<br/>esbuild, resvg icon, vsce package"]
    vsix["out: nu-lint-X.Y.Z.vsix"]
    unpacked["unpacked: extension directory"]
    e2eBundle["e2e: mocha suites and fixtures"]
    staticAnalysis["static-analysis<br/>tsc, eslint, node --test"]
    logoCheck["logos-match-nu-lint"]
    vmTest["NixOS VM test<br/>VSCodium, nushell extension, nu-lint"]

    nixpkgs --> pnpmDeps --> extensionBuild
    nuLintInput --> extensionBuild
    extensionBuild --> vsix
    extensionBuild --> unpacked
    extensionBuild --> e2eBundle
    pnpmDeps --> staticAnalysis
    nuLintInput --> logoCheck
    vsix --> logoCheck
    unpacked --> vmTest
    e2eBundle --> vmTest
    nuLintInput --> vmTest
```

The end-to-end tests are grouped per scenario under `test/e2e/<scenario>/`:

| File | Role |
|---|---|
| `default.nix` | the NixOS VM; it exposes the build outputs under `/etc/nu-lint-e2e` |
| `test_script.py` | the test driver: prepares a workspace, starts VSCodium, checks the report |
| `*_suite.ts` | the mocha suite that runs inside the VS Code extension host |
| `fixture_workspace/` | the files the suite opens |

The suites write a JSON report with passed and failed counts. The driver requires a minimum number of passed tests, so a VSCodium run that exits without running any suite cannot pass.

## Releases

```mermaid
sequenceDiagram
    participant Developer
    participant Main as main branch
    participant ReleasePlease as release-please job
    participant Publish as publish job
    participant GitHub as GitHub release
    participant Marketplace as VS Code Marketplace
    participant OpenVSX as Open VSX

    Developer->>Main: push conventional commits
    Main->>ReleasePlease: release workflow
    ReleasePlease->>Main: open or update the release pull request
    Developer->>Main: merge the release pull request
    Main->>ReleasePlease: release workflow
    ReleasePlease->>GitHub: create tag vX.Y.Z and release
    ReleasePlease->>Publish: release_created
    Publish->>Publish: nix flake check, nix build .#vsix
    Publish->>GitHub: upload the .vsix
    Publish->>Marketplace: vsce publish --oidc (Trusted Publishing)
    Publish->>OpenVSX: ovsx publish
```

The credentials for the last two steps are described in [secrets.md](secrets.md).
