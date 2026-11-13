{
  description = "VS Code extension for the nu-lint Nushell linter";

  nixConfig = {
    extra-substituters = [ "https://wvhulle.cachix.org" ];
    extra-trusted-public-keys = [
      "wvhulle.cachix.org-1:heXx8DZMiRsKUx6l1TxNoF+Nmtmz66QEdsonQzc1ir0="
    ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nu-lint.url = "git+https://codeberg.org/wvhulle/nu-lint";
  };

  outputs =
    {
      nixpkgs,
      nu-lint,
      ...
    }:
    let
      inherit (nixpkgs) lib;
      forEachSystem =
        generatePerSystem:
        lib.genAttrs
          [
            "x86_64-linux"
            "aarch64-linux"
            "x86_64-darwin"
            "aarch64-darwin"
          ]
          (
            system:
            let
              pkgs = nixpkgs.legacyPackages.${system};
              logoSvg = "${nu-lint}/assets/logo.svg";
            in
            generatePerSystem {
              inherit system pkgs logoSvg;
              nuLintPackage = nu-lint.packages.${system}.default;
              extensionBuilds = import ./nix/extension-builds.nix {
                inherit pkgs logoSvg;
                src = lib.fileset.toSource {
                  root = ./.;
                  fileset = lib.fileset.unions [
                    ./package.json
                    ./pnpm-lock.yaml
                    ./tsconfig.json
                    ./eslint.config.mjs
                    ./esbuild.mjs
                    ./README.md
                    ./LICENSE
                    ./.vscodeignore
                    ./src
                    ./test
                  ];
                };
              };
            }
          );
    in
    {
      packages = forEachSystem (
        { extensionBuilds, nuLintPackage, ... }:
        {
          default = extensionBuilds.extensionBuild;
          vsix = extensionBuilds.extensionBuild;
          nu-lint = nuLintPackage;
        }
      );

      checks = forEachSystem (
        {
          system,
          pkgs,
          extensionBuilds,
          nuLintPackage,
          logoSvg,
          ...
        }:
        {
          static-analysis = extensionBuilds.staticAnalysis;
          vsix = extensionBuilds.extensionBuild;
          logos-match-nu-lint =
            pkgs.runCommand "logos-match-nu-lint"
              {
                nativeBuildInputs = [
                  pkgs.resvg
                  pkgs.unzip
                ];
              }
              ''
                resvg --width 256 --height 256 ${logoSvg} input-logo.png
                unzip -p ${extensionBuilds.extensionBuild}/*.vsix extension/icon.png > packaged-icon.png
                if ! cmp -s input-logo.png packaged-icon.png; then
                  echo "the .vsix icon is not rendered from nu-lint's assets/logo.svg" >&2
                  exit 1
                fi
                if ! cmp -s input-logo.png ${./docs/logo.png}; then
                  echo "docs/logo.png differs from nu-lint's assets/logo.svg; regenerate it with 'pnpm run logo' in the dev shell" >&2
                  exit 1
                fi
                touch $out
              '';
        }
        // lib.optionalAttrs (system == "x86_64-linux") (
          import ./test/e2e {
            inherit pkgs;
            nu-lint = nuLintPackage;
            inherit (extensionBuilds) extensionBuild;
          }
        )
      );

      devShells = forEachSystem (
        {
          pkgs,
          extensionBuilds,
          nuLintPackage,
          logoSvg,
          ...
        }:
        {
          default = pkgs.mkShell {
            packages = [
              extensionBuilds.nodejs
              extensionBuilds.pnpm
              nuLintPackage
              pkgs.resvg
            ];
            NU_LINT_LOGO_SVG = logoSvg;
          };
        }
      );

      formatter = forEachSystem ({ pkgs, ... }: pkgs.nixfmt-tree);
    };
}
