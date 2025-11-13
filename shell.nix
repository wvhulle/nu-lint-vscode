{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_20
    nodePackages.pnpm
    nodePackages.typescript
  ];

  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"
    export PNPM_HOME="$HOME/.local/share/pnpm"

    # Install vsce locally if not present
    if [ ! -f node_modules/.bin/vsce ]; then
      echo "Installing @vscode/vsce locally..."
      pnpm install --save-dev @vscode/vsce
    fi

    echo "VSCode Extension Development Environment"
    echo "Node.js: $(node --version)"
    echo "pnpm: $(pnpm --version)"
    echo "TypeScript: $(tsc --version)"

    if [ -f node_modules/.bin/vsce ]; then
      echo "vsce: $(node_modules/.bin/vsce --version)"
    fi
  '';
}