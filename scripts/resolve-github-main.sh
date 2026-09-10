#!/usr/bin/env bash
# Resolve canonical GitHub main tip SHA and protection flag for MCP publish gates.
# Prints: <sha> <protected>
# Requires: GH_TOKEN, GITHUB_REPOSITORY
# Optional: GH_HOST / gh defaults for github.com
set -euo pipefail

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is required to resolve canonical GitHub main." >&2
  exit 1
fi

if [[ -z "${GITHUB_REPOSITORY:-}" ]]; then
  echo "GITHUB_REPOSITORY is required to resolve canonical GitHub main." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to resolve canonical GitHub main." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to parse canonical GitHub main metadata." >&2
  exit 1
fi

ERR_FILE=$(mktemp)
trap 'rm -f "$ERR_FILE"' EXIT

set +e
MAIN_JSON=$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" 2>"$ERR_FILE")
API_STATUS=$?
set -e

if [[ "$API_STATUS" -ne 0 ]]; then
  ERR_BODY=$(cat "$ERR_FILE")
  HTTP_CODE=$(printf '%s' "$ERR_BODY" | sed -nE 's/.*\(HTTP ([0-9]{3})\).*/\1/p' | head -n 1)
  if [[ -z "$HTTP_CODE" ]]; then
    HTTP_CODE="unknown"
  fi
  echo "GitHub API HTTP ${HTTP_CODE} resolving repos/${GITHUB_REPOSITORY}/branches/main" >&2
  echo "body: ${ERR_BODY}" >&2
  exit 1
fi

MAIN_SHA=$(printf '%s' "$MAIN_JSON" | jq -r '.commit.sha // empty')
MAIN_PROTECTED=$(printf '%s' "$MAIN_JSON" | jq -r '.protected | tostring')

if [[ -z "$MAIN_SHA" || -z "$MAIN_PROTECTED" || "$MAIN_PROTECTED" == "null" ]]; then
  echo "GitHub API HTTP 200 resolving repos/${GITHUB_REPOSITORY}/branches/main returned an unusable payload" >&2
  echo "body: ${MAIN_JSON}" >&2
  exit 1
fi

printf '%s %s\n' "$MAIN_SHA" "$MAIN_PROTECTED"
# Trailing newline is required: `read` under `set -e` exits 1 on EOF without one.
