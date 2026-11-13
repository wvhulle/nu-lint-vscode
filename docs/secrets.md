# Release secrets

The release workflow (`.github/workflows/release.yml`) publishes from the `publish` job, which runs in the GitHub environment `marketplaces`. This page lists every credential it uses, how to create it, and how to store it.

The Visual Studio Marketplace needs no secret: it uses Trusted Publishing, set up once on the Marketplace side.

| Secret | Scope | Required | Used for |
|---|---|---|---|
| `OVSX_PAT` | environment `marketplaces` | yes | publishing to Open VSX |
| `RELEASE_PLEASE_TOKEN` | repository | recommended | opening release pull requests that trigger the checks workflow |
| `CACHIX_AUTH_TOKEN` | repository | optional | pushing CI builds to the `wvhulle` binary cache |

## Visual Studio Marketplace

The publisher **WillemVanhulle** must exist at <https://marketplace.visualstudio.com/manage> under the Microsoft account you use below. Its ID must equal `publisher` in `package.json`.

### Trusted Publishing

The `publish` job has `id-token: write` permission and runs `vsce publish --oidc`. GitHub Actions then proves its identity to the Marketplace with a short-lived OIDC token, so no Marketplace secret is stored in the repository.

1. In the Marketplace management page of publisher WillemVanhulle, add a trusted publishing policy for:
   - repository `wvhulle/nu-lint-vscode`
   - workflow `release.yml`
   - environment `marketplaces`, when asked
2. Remove any old `VSCE_PAT` secret; the workflow no longer reads it.

OIDC publishing does not fall back to a token. Until the policy exists, or when it does not match the repository, workflow or environment, the Marketplace step fails. The Open VSX step still runs, because the two publish steps do not depend on each other. After fixing the policy, rerun the `publish` job.

Azure DevOps personal access tokens are not an alternative: global tokens, which Marketplace publishing requires, are retired on December 1, 2026.

## Open VSX

1. Create an Eclipse account at <https://accounts.eclipse.org>. Fill in **GitHub Username** with the GitHub account you use on Open VSX.
2. Log in to <https://open-vsx.org> with that GitHub account. On your profile page choose **Log in with Eclipse**, then **Show Publisher Agreement**, and accept it.
3. Open **avatar → Settings → Access Tokens → Generate New Token**. Copy the value immediately; it is never shown again.
4. Create the namespace once. Its name must equal `publisher` in `package.json`:

   ```bash
   nix develop --command pnpm exec ovsx create-namespace WillemVanhulle -p <token>
   ```

5. Optionally claim verified ownership of the namespace, as described on the [Namespace Access](https://github.com/eclipse/openvsx/wiki/Namespace-Access) wiki page. Creating a namespace does not make you its verified owner.

## Release pull request token

release-please opens the release pull request. With the default `GITHUB_TOKEN`, GitHub does not start other workflows for that pull request, so the checks never run on it. A fine-grained token avoids that.

1. Open **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Fill in:
   - **Resource owner:** `wvhulle`
   - **Repository access:** only `wvhulle/nu-lint-vscode`
   - **Repository permissions:** Contents *read and write*, Pull requests *read and write*, Issues *read and write* (release-please labels its pull requests)
   - **Expiration:** pick one and set a reminder; when the token expires, release pull requests stop appearing.

Without this secret the workflow falls back to `GITHUB_TOKEN`, which needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**.

## Cachix

At <https://app.cachix.org>, open cache **wvhulle → Settings → Auth tokens** and create a token with write access. Without it, CI still reads from the cache but does not push to it. Pull requests never receive it.

## Storing the secrets

`gh secret set` prompts for the value, so it does not end up in shell history.

```bash
gh api --method PUT repos/wvhulle/nu-lint-vscode/environments/marketplaces
gh secret set OVSX_PAT --env marketplaces --repo wvhulle/nu-lint-vscode
gh secret set RELEASE_PLEASE_TOKEN --repo wvhulle/nu-lint-vscode
gh secret set CACHIX_AUTH_TOKEN --repo wvhulle/nu-lint-vscode
gh api --method PUT repos/wvhulle/nu-lint-vscode/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

Optionally protect the `marketplaces` environment with required reviewers under **Settings → Environments**, so every publish waits for your approval.

## Rotation

| Credential | Expires | When it expires |
|---|---|---|
| `OVSX_PAT` | never, unless revoked | the Open VSX step fails |
| `RELEASE_PLEASE_TOKEN` | at the chosen date | no new release pull requests appear |
| `CACHIX_AUTH_TOKEN` | never, unless revoked | CI stops pushing to the cache |

A failed publish leaves the GitHub release and its `.vsix` in place. After fixing the secret, rerun the failed `publish` job from the Actions tab; both publish steps pass `--skip-duplicate`, so a registry that already has the version is skipped.
