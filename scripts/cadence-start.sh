#!/usr/bin/env bash
# cadence-start.sh - Wrapper to load secrets before starting Cadence
#
# Used by launchd to start Cadence with API keys available.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="$(dirname "$SCRIPT_DIR")"

# Load secrets from .env if it exists
ENV_FILE="$HOME/.openclaw/.env"
if [[ -f "$ENV_FILE" ]]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# Also try .env in openclaw project root
PROJECT_ENV="$OPENCLAW_DIR/.env"
if [[ -f "$PROJECT_ENV" ]]; then
    set -a
    source "$PROJECT_ENV"
    set +a
fi

cd "$OPENCLAW_DIR"
exec "$HOME/.bun/bin/bun" scripts/cadence.ts start
