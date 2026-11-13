{
  pkgs,
  nu-lint,
  extensionBuild,
}:
pkgs.testers.runNixOSTest {
  name = "nu-lint-vscode-language-server";

  nodes.editor =
    { modulesPath, ... }:
    {
      imports = [
        "${modulesPath}/../tests/common/user-account.nix"
        "${modulesPath}/../tests/common/x11.nix"
      ];
      test-support.displayManager.auto.user = "alice";
      virtualisation.memorySize = 4096;
      virtualisation.cores = 2;
      environment.systemPackages = [
        nu-lint
      ];
      environment.etc = {
        "nu-lint-e2e/codium-electron".source = "${pkgs.vscodium}/lib/vscode/codium";
        "nu-lint-e2e/extension".source = extensionBuild.unpacked;
        "nu-lint-e2e/extension-suites".source = extensionBuild.e2e;
        "nu-lint-e2e/nushell-extensions".source =
          "${pkgs.vscode-extensions.thenuprojectcontributors.vscode-nushell-lang}/share/vscode/extensions";
        "nu-lint-e2e/workspace".source = ./fixture_workspace;
      };
    };

  testScript = builtins.readFile ./test_script.py;
}
