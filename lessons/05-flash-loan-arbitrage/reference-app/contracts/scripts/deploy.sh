#!/usr/bin/env bash
#
# Publishes the arb_executor package against a running DeepBook Sandbox localnet.
#
# Strategy (mirrors deepbook-sandbox-evaluation-apps/.../deploy.sh):
#   1. Stage sources/arb_executor.move + a freshly-generated Move.toml into a
#      temp package dir INSIDE $DEEPBOOK_SANDBOX_DIR so the relative deps to
#      .external-packages/{token,deepbook} resolve locally.
#   2. Run `sui client test-publish -e localnet` there, pinning the publish
#      manifest at $DEEPBOOK_SANDBOX_DIR/Pub.localnet.toml.
#   3. Parse the published packageId from objectChanges and write it to
#      lessons/_snippets/03-flash-loan/deployment.json.
#
# Parameterized by DEEPBOOK_SANDBOX_DIR (default: $HOME/workspace/deepbook-sandbox/sandbox).
# The live localnet was published from a worktree, so override it, e.g.:
#   DEEPBOOK_SANDBOX_DIR=$HOME/workspace/deepbook-sandbox/.claude/worktrees/fix-esbuild-build/sandbox \
#     bash lessons/_snippets/03-flash-loan/contracts/scripts/deploy.sh
set -euo pipefail

# Resolve directories relative to this script: <snippet>/contracts/scripts/deploy.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SNIPPET_DIR="$(cd "$CONTRACTS_DIR/.." && pwd)"

DEEPBOOK_SANDBOX_DIR="${DEEPBOOK_SANDBOX_DIR:-$HOME/workspace/deepbook-sandbox/sandbox}"
TARGET_DIR="$DEEPBOOK_SANDBOX_DIR/packages/arb_executor"

if [[ ! -f "$DEEPBOOK_SANDBOX_DIR/Pub.localnet.toml" ]]; then
    echo "ERROR: $DEEPBOOK_SANDBOX_DIR/Pub.localnet.toml not found."
    echo "       Run 'cd $DEEPBOOK_SANDBOX_DIR && pnpm deploy-all' first,"
    echo "       or point DEEPBOOK_SANDBOX_DIR at the worktree that published the live localnet."
    exit 1
fi

CHAIN_ID=$(grep -E '^chain-id' "$DEEPBOOK_SANDBOX_DIR/Pub.localnet.toml" | head -1 | cut -d'"' -f2 || true)
if [[ -z "$CHAIN_ID" ]]; then
    echo "ERROR: could not find the localnet chain-id in Pub.localnet.toml."
    exit 1
fi

trap 'rm -rf "$TARGET_DIR"' ERR EXIT

echo "==> Staging arb_executor inside $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR/sources"
cp "$CONTRACTS_DIR/sources/arb_executor.move" "$TARGET_DIR/sources/"

# NOTE: no [addresses] block — a named-address module (`module arb_executor::...`)
# binds its address via the environment at publish time. An explicit
# [addresses] block makes the build reject the `localnet` environment with a
# misleading "Environment `localnet` is not present" error.
cat >"$TARGET_DIR/Move.toml" <<TOML
[package]
name = "arb_executor"
edition = "2024"

[dependencies]
token = { local = "../../.external-packages/token" }
deepbook = { local = "../../.external-packages/deepbook" }

[environments]
localnet = "$CHAIN_ID"
TOML

echo "==> Publishing arb_executor against localnet (chain-id=$CHAIN_ID)"
cd "$TARGET_DIR"
sui client test-publish \
    -e localnet \
    --pubfile-path "$DEEPBOOK_SANDBOX_DIR/Pub.localnet.toml" \
    --json >"$SNIPPET_DIR/publish.json"

PACKAGE_ID=$(
    node -e "
const d = JSON.parse(require('fs').readFileSync(process.argv[1]));
const pkg = (d.objectChanges || []).find(c => c.type === 'published');
if (!pkg) { console.error('no published object found'); process.exit(1); }
console.log(pkg.packageId);
" "$SNIPPET_DIR/publish.json"
)

if [[ -z "$PACKAGE_ID" || "$PACKAGE_ID" == "undefined" ]]; then
    echo "ERROR: packageId could not be parsed from publish.json" >&2
    exit 1
fi

echo "==> Package published: $PACKAGE_ID"

cat >"$SNIPPET_DIR/deployment.json" <<JSON
{
  "arbExecutorPackageId": "$PACKAGE_ID"
}
JSON

echo
echo "Done."
echo "  arbExecutorPackageId: $PACKAGE_ID"
echo "  wrote: $SNIPPET_DIR/deployment.json"
