#!/bin/sh
set -e
case "$1" in
  web) exec pnpm --filter @epic/web start ;;
  worker) exec pnpm --filter @epic/worker start ;;
  *) exec "$@" ;;
esac
