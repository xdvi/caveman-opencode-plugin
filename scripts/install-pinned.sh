#!/usr/bin/env sh
# install the opencode plugin surgical v2 from vendored pinned files.
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PIN_FILE="$REPO_DIR/UPSTREAM_PIN.json"

[ -f "$PIN_FILE" ] || { echo "ERROR: no UPSTREAM_PIN.json, run sync-upstream.sh first" >&2; exit 1; }

config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
plugin_dir="$config_dir/plugins/caveman"
commands_dir="$config_dir/commands"
skills_dir="$config_dir/skills"

link=false
if [ "${1:-}" = "--link" ]; then
  link=true
  shift
fi

mkdir -p "$plugin_dir" "$commands_dir" "$config_dir/plugins"

put() {
  if $link; then
    ln -sfn "$1" "$2"
  else
    cp "$1" "$2"
  fi
}

# 1. Install CJS helpers from vendored hooks
put "$REPO_DIR/vendor/src/hooks/caveman-config.js" "$plugin_dir/caveman-config.cjs"
put "$REPO_DIR/vendor/src/hooks/caveman-parse.js" "$plugin_dir/caveman-parse.cjs"
echo '{"name":"caveman-opencode-plugin","type":"module"}' > "$plugin_dir/package.json"

# 2. Install v2 adapter
put "$REPO_DIR/adapter/v2/caveman.ts" "$config_dir/plugins/caveman-v2.ts"

# 3. Install core commands
for cmd in "$REPO_DIR/vendor/src/plugins/opencode/commands/"*.md; do
  [ -f "$cmd" ] && cp "$cmd" "$commands_dir/"
done

# 4. Install only core opencode skills (caveman, caveman-commit, caveman-review, caveman-help, caveman-stats)
# Skip cavecrew (Claude subagent dispatcher) and caveman-compress (Python benchmark suite)
for skill in caveman caveman-commit caveman-review caveman-help caveman-stats; do
  if [ -d "$REPO_DIR/vendor/skills/$skill" ]; then
    mkdir -p "$skills_dir/$skill"
    cp -R "$REPO_DIR/vendor/skills/$skill/." "$skills_dir/$skill/"
  fi
done

# 5. Ensure Tier-3 base rule in AGENTS.md if not present
agents_md="$config_dir/AGENTS.md"
if [ ! -f "$agents_md" ]; then
  cat <<'EOF' > "$agents_md"
<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->
EOF
fi

echo "Installed clean caveman v2 plugin to $config_dir/plugins/caveman-v2.ts"
