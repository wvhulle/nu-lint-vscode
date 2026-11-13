# Contributing

## Development environment

`nix develop` (or direnv with `use flake`) provides Node.js, pnpm and nu-lint.

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test:unit
```

The extension icon is rendered from nu-lint's [`assets/logo.svg`](https://codeberg.org/wvhulle/nu-lint/src/branch/main/assets/logo.svg) (the `nu-lint` flake input). `nix build` does this automatically; for a local `vsce package`, run `pnpm run icon` inside the dev shell first.

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

Repository settings the workflows need:

- Secrets `VSCE_PAT` (Azure DevOps token with Marketplace manage scope for publisher `WillemVanhulle`) and `OVSX_PAT` (Open VSX token; create the namespace once with `pnpm exec ovsx create-namespace WillemVanhulle`).
- Optional `CACHIX_AUTH_TOKEN` to push builds to the `wvhulle` cache.
- Optional `RELEASE_PLEASE_TOKEN` (fine-grained token with contents and pull request write access). Without it, release pull requests are opened with `GITHUB_TOKEN` and do not trigger the checks workflow.
- Enable *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*.
