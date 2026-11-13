# Contributing

## Development environment

`nix develop` (or direnv with `use flake`) provides Node.js, pnpm and nu-lint.

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test:unit
```

See [docs/architecture.md](docs/architecture.md) for how the extension, the language server, the tests and the release pipeline fit together.

The extension icon is rendered from nu-lint's [`assets/logo.svg`](https://codeberg.org/wvhulle/nu-lint/src/branch/main/assets/logo.svg) (the `nu-lint` flake input). `nix build` does this automatically; for a local `vsce package`, run `pnpm run icon` inside the dev shell first. The README shows the committed `docs/logo.png`, because the Marketplace rejects SVG images from Codeberg. The `readme-logo-matches-nu-lint` check fails when it drifts from the SVG; regenerate it with `pnpm run logo`.

Press F5 in VS Code to start an extension development host with the extension loaded. The "Run End-to-End Suites" launch configuration runs the extension-host suites against your local nu-lint with an isolated `XDG_CONFIG_HOME`.

## Tests

- `test/unit/`: pure modules, run with the Node.js test runner.
- `test/e2e/<scenario>/`: one folder per end-to-end scenario. Each folder contains a NixOS VM test (`default.nix`), its driver script (`test_script.py`), the mocha suite that runs inside the VS Code extension host, and a fixture workspace.

`nix flake check` runs everything, including the VM tests (x86_64-linux with KVM). To debug a VM test interactively:

```bash
nix build .#checks.x86_64-linux.vscode-e2e-language-server.driverInteractive
./result/bin/nixos-test-driver
```

## Releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). On every push to `main`, release-please opens or updates a release pull request that bumps `package.json` and `CHANGELOG.md`. Merging that pull request creates the `vX.Y.Z` tag and the GitHub release. The release workflow then runs all checks, attaches the `.vsix` to the release, and publishes to the Visual Studio Marketplace and Open VSX.

The credentials and repository settings the release workflow needs are described in [docs/secrets.md](docs/secrets.md).
