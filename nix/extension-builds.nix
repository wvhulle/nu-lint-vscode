{
  pkgs,
  src,
  logoSvg,
}:
let
  inherit (pkgs) lib;
  packageManifest = lib.importJSON (src + "/package.json");
  pnpm = pkgs.pnpm_10;
  nodejs = pkgs.nodejs_24;

  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = packageManifest.name;
    inherit (packageManifest) version;
    inherit src pnpm;
    fetcherVersion = 5;
    hash = "sha256-9+EoJ9L9BGkJhRzF0GmDmx8G5tTTfKF25DC1l3KQPGc=";
  };

  buildWithNodeModules =
    attributes:
    pkgs.stdenvNoCC.mkDerivation (
      {
        pname = packageManifest.name;
        inherit (packageManifest) version;
        inherit src pnpmDeps;
        nativeBuildInputs = [
          nodejs
          pnpm
          pkgs.pnpmConfigHook
          pkgs.resvg
        ];
      }
      // attributes
    );
in
{
  inherit nodejs pnpm;

  extensionBuild = buildWithNodeModules {
    outputs = [
      "out"
      "unpacked"
      "e2e"
    ];
    buildPhase = ''
      runHook preBuild
      resvg --width 256 --height 256 ${logoSvg} icon.png
      pnpm run build
      pnpm run build:e2e
      pnpm exec vsce package --no-dependencies --out ${packageManifest.name}-${packageManifest.version}.vsix
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      install -Dm644 ${packageManifest.name}-${packageManifest.version}.vsix -t $out
      mkdir -p $unpacked/out
      cp package.json README.md LICENSE icon.png $unpacked/
      cp out/extension.js $unpacked/out/
      install -Dm644 out/test/run_extension_suites.js -t $e2e
      install -Dm755 out/test/legacy_nu_lint.sh -t $e2e
      runHook postInstall
    '';
  };

  staticAnalysis = buildWithNodeModules {
    pname = "${packageManifest.name}-static-analysis";
    buildPhase = ''
      runHook preBuild
      pnpm run typecheck
      pnpm run lint
      pnpm run test:unit
      runHook postBuild
    '';
    installPhase = ''
      touch $out
    '';
  };
}
