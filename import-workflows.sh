#!/bin/bash
set -euo pipefail

REMOTE_NAME="actions-dist"
REMOTE_URL="https://REDACTED_HOST/mygitea-actions/actions-dist.git"
PREFIX=".gitea/workflows"
BRANCH="main"

# Ensure we are in a git repository
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: not a git repository" >&2
  exit 1
fi

# Add remote if not exists
if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  echo "Adding remote: $REMOTE_NAME"
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

# Initial add or update
if [ -d "$PREFIX" ] && git ls-files --error-unmatch "$PREFIX" >/dev/null 2>&1; then
  echo "Updating subtree: $PREFIX"
  git subtree pull --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH" --squash -m "Update $PREFIX from $REMOTE_NAME"
else
  echo "Adding subtree: $PREFIX"
  git subtree add --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH" --squash
fi

echo "Done."