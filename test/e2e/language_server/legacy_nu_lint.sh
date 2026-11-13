#!/bin/sh
echo "$*" >> "$(dirname "$0")/invocations.log"
case "$1" in
    --version) echo "nu-lint 1.6.0" ;;
    lsp)
        echo "error: unrecognized subcommand 'lsp'" >&2
        exit 2
        ;;
    *) exec nu-lint "$@" ;;
esac
