{
  pkgs,
  nu-lint,
  extensionBuild,
}:
let
  sharedArguments = {
    inherit pkgs nu-lint extensionBuild;
  };
in
{
  vscode-e2e-language-server = import ./language_server sharedArguments;
}
