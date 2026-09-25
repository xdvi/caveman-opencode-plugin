# caveman-opencode-plugin

OpenCode v2 adapter, test harness, and upstream tracker for [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman).

Upstream `caveman` targets OpenCode's legacy v1 hook API (`chat.message`, `experimental.chat.system.transform`). OpenCode v2 replaced this architecture with an Effect-TS plugin system (`setup`, `session.hook("prompt")`, `session.hook("context")`, `event.subscribe`).

This repository provides:
1. **OpenCode v2 Adapter** (`adapter/v2/caveman.ts`): Modern Effect-TS integration with dynamic mode switching and prompt deduplication.
2. **Surgical Installer** (`scripts/install-pinned.sh`): Installs directly from local vendored sources with zero network overhead and zero third-party subagent pollution.
3. **Upstream Pin & Verification** (`UPSTREAM_PIN.json`, `tests/`): Strict byte-for-byte cryptographic integrity checks against upstream releases.

---

## Key Features

- **OpenCode v2 Compatibility**: Full support for OpenCode v2+ using session-level Effect hooks.
- **Smart Token Deduplication**: If caveman rules are already part of the system prompt (e.g., via `AGENTS.md`), the adapter skips re-injecting 5KB+ of redundant rules and outputs only an active mode banner.
- **Surgical Installation**: Copies only required CJS runtime helpers (`caveman-config.cjs`, `caveman-parse.cjs`) without dropping Claude/Gemini subagents (`cavecrew-*`) into `~/.config/ai/agents/` or bundling Python benchmark scripts.
- **Contract Tests**: Functional test suite verifying vendor integrity, dynamic flag switching (`/caveman <mode>`), natural language stop commands, and v2 context transformations.

---

## Repository Layout

```text
├── adapter/
│   ├── v1/caveman.ts          # Legacy OpenCode v1 loader shim
│   └── v2/caveman.ts          # OpenCode v2 Effect adapter
├── scripts/
│   ├── install-pinned.sh      # Surgical installer for OpenCode plugins directory
│   └── sync-upstream.sh       # Sync script fetching upstream commits and updating pin
├── tests/
│   ├── contract.test.ts       # Byte-for-byte pin validation and vendor behavior tests
│   ├── v2contract.test.ts     # OpenCode v2 mock context & deduplication tests
│   └── install.test.ts        # Surgical installer integration tests
├── vendor/                    # Verbatim payload from upstream pinned SHA
├── UPSTREAM_PIN.json          # Pinned commit SHA and per-file SHA256 hashes
└── NOTICE.md                  # Upstream license and copyright notices
```

---

## Installation

### Automatic (Recommended)

Run the surgical installer script:

```sh
sh scripts/install-pinned.sh
```

To preview the actions without modifying any files:

```sh
sh scripts/install-pinned.sh --dry-run
```

By default, this installs:
- `~/.config/opencode/plugins/caveman-v2.ts`
- `~/.config/opencode/plugins/caveman/caveman-config.cjs`
- `~/.config/opencode/plugins/caveman/caveman-parse.cjs`
- `~/.config/opencode/plugins/caveman/package.json`

### Custom Config Directory

Set `OPENCODE_CONFIG_DIR` if your configuration lives elsewhere:

```sh
OPENCODE_CONFIG_DIR="/custom/path" sh scripts/install-pinned.sh
```

---

## Usage

Once installed, restart your OpenCode session or daemon:

- **Switch mode**: `/caveman lite`, `/caveman full`, `/caveman ultra`
- **Revert to normal**: Type `stop caveman` or `normal mode`

---

## Development & Testing

Run the full test suite using [Bun](https://bun.sh):

```sh
bun test
```

### Upstream Synchronization

To fetch the latest commit from upstream `JuliusBrussee/caveman` and update `vendor/` along with `UPSTREAM_PIN.json`:

```sh
# Sync to latest main
sh scripts/sync-upstream.sh

# Or sync to a specific SHA
sh scripts/sync-upstream.sh <commit-sha>
```

---

## License & Attribution

All code inside `vendor/` is licensed under the MIT License by Julius Brussee. See [NOTICE.md](NOTICE.md) for details.
Adapter code and tooling in this repository are available under the MIT License.
