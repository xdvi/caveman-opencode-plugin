#!/usr/bin/env sh
# sync vendor/ + UPSTREAM_PIN.json from upstream at a given sha (default: main).
set -eu

REPO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
UPSTREAM_REPO="${CAVEMAN_UPSTREAM_REPO:-JuliusBrussee/caveman}"
PIN_FILE="$REPO_DIR/UPSTREAM_PIN.json"
VENDOR_DIR="$REPO_DIR/vendor"

TRACKED_FILES="src/plugins/opencode/plugin.js
src/plugins/opencode/package.json
src/plugins/opencode/commands/caveman.md
src/plugins/opencode/commands/caveman-commit.md
src/plugins/opencode/commands/caveman-review.md
src/plugins/opencode/commands/caveman-compress.md
src/plugins/opencode/commands/caveman-stats.md
src/plugins/opencode/commands/caveman-help.md
src/hooks/caveman-config.js
src/hooks/caveman-parse.js
agents/cavecrew-investigator.md
agents/cavecrew-builder.md
agents/cavecrew-reviewer.md"
TRACKED_DIRS="skills/caveman
skills/caveman-commit
skills/caveman-review
skills/caveman-help
skills/caveman-stats
skills/caveman-compress
skills/cavecrew"

sha="${1:-}"
if [ -z "$sha" ]; then
  sha=$(git ls-remote "https://github.com/$UPSTREAM_REPO.git" HEAD | awk '{print $1}')
fi
case "$sha" in
  '' | *[!0-9a-f]*) echo "ERROR: bad sha: $sha" >&2; exit 1;;
esac
[ "${#sha}" -eq 40 ] || { echo "ERROR: bad sha: $sha" >&2; exit 1; }

work=$(mktemp -d "${TMPDIR:-/tmp}/caveman-sync.XXXXXX")
trap 'rm -rf "$work"' EXIT
tarball="$work/source.tar.gz"
curl -fsSL "https://github.com/$UPSTREAM_REPO/archive/$sha.tar.gz" -o "$tarball"
tar -xzf "$tarball" -C "$work"
src="$work/caveman-$sha"
[ -d "$src" ] || { echo "ERROR: unexpected tarball layout" >&2; exit 1; }

missing=""
for f in $TRACKED_FILES; do
  [ -f "$src/$f" ] || missing="$missing $f"
done
for d in $TRACKED_DIRS; do
  [ -f "$src/$d/SKILL.md" ] || missing="$missing $d/SKILL.md"
done
if [ -n "$missing" ]; then
  echo "ERROR: upstream layout changed, missing:$missing" >&2
  exit 1
fi

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR"
for f in $TRACKED_FILES; do
  mkdir -p "$VENDOR_DIR/$(dirname "$f")"
  cp "$src/$f" "$VENDOR_DIR/$f"
done
for d in $TRACKED_DIRS; do
  mkdir -p "$VENDOR_DIR/$d"
  cp -R "$src/$d/." "$VENDOR_DIR/$d/"
  find "$VENDOR_DIR/$d" -name '__pycache__' -type d -prune -exec rm -rf {} +
done

python3 - "$PIN_FILE" "$VENDOR_DIR" "$UPSTREAM_REPO" "$sha" <<'PY'
import hashlib, json, sys
from pathlib import Path
pin_file, vendor, repo, sha = sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]
files = {}
for path in sorted(vendor.rglob("*")):
    if path.is_file():
        files[str(path.relative_to(vendor))] = hashlib.sha256(path.read_bytes()).hexdigest()
Path(pin_file).write_text(json.dumps({"repo": repo, "sha": sha, "files": files}, indent=2) + "\n")
print(f"pinned {repo}@{sha} ({len(files)} files)")
PY
