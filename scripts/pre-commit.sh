#!/bin/sh
# Blocks commits whose staged changes contain secrets. This repo is public.
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "pre-commit: gitleaks is not installed. Install it (brew install gitleaks) and retry." >&2
  exit 1
fi
exec gitleaks git --pre-commit --staged --redact --no-banner -v
