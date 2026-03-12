# VM Testing, Doc Caching, and Config Updates Design

**Date:** 2026-03-11
**Status:** Approved

## Overview

Add cross-platform testing infrastructure, a documentation caching script, and update the syncable config items to match the current Claude Code directory structure. This lays the groundwork for a future Tauri-based standalone visualisation app.

## 1. ~~Doc-Caching Script~~ (Dropped)

> **Dropped 2026-03-12:** Unnecessary - Claude Code's built-in `/docs` skill provides access to 575+ docs without needing a local cache or pandoc dependency.

### Purpose

Fetch the most relevant Claude Code documentation pages and store them locally in the repo. Run before brainstorm or design sessions to avoid repeated web fetches and to have an offline reference.

### Pages fetched (12 pages)

| Page | Why |
|------|-----|
| `settings` | Settings files, directory structure, config paths |
| `memory` | CLAUDE.md locations, auto memory, rules/, projects/ structure |
| `skills` | Skills directory structure, SKILL.md format, commands/ |
| `hooks` | Hook configuration format (lives in settings.json) |
| `sub-agents` | Agent directory structure, agent config |
| `plugins` | Plugin creation, directory structure |
| `plugins-reference` | Plugin config file formats |
| `permissions` | Permission scopes, settings file locations |
| `setup` | Installation paths, platform support |
| `keybindings` | Keybindings.json location and format |
| `changelog` | Breaking changes, new config items |
| `how-claude-code-works` | General architecture |

### File structure

```
scripts/
├── fetch-docs.sh           # Fetches all reference docs + prints changelog warnings
└── check-changelog.sh      # Standalone changelog scanner for quick checks

docs/
└── claude-reference/
    ├── settings.md
    ├── memory.md
    ├── skills.md
    ├── hooks.md
    ├── sub-agents.md
    ├── plugins.md
    ├── plugins-reference.md
    ├── permissions.md
    ├── setup.md
    ├── keybindings.md
    ├── changelog.md
    ├── how-claude-code-works.md
    ├── .last-fetched
    └── .last-changelog-check
```

### Behaviour

- `fetch-docs.sh` uses `curl` to fetch each page from `https://code.claude.com/docs/en/<page>` (confirmed working - docs.anthropic.com 301-redirects to code.claude.com)
- Converts HTML to plain text using `pandoc` (required dependency - install via `brew install pandoc` on macOS or `apt install pandoc` on Linux). `pandoc` is reliable for HTML-to-markdown; `sed`-based stripping is too fragile for real HTML.
- Writes each page to `docs/claude-reference/<page>.md`
- Records fetch timestamp in `.last-fetched`
- Skips fetching if docs were updated within the last 24 hours (override with `--force`)
- At the end, runs changelog checking logic and prints any relevant warnings
- Docs are committed to the repo for offline and CI use
- The current `.gitignore` excludes all of `docs/` - add `!docs/claude-reference/` to negate this for the reference docs
- `.last-fetched` and `.last-changelog-check` are gitignored via specific entries (`docs/claude-reference/.last-fetched`, `docs/claude-reference/.last-changelog-check`)

### Changelog checker

- `check-changelog.sh` parses the fetched changelog for keywords: `~/.claude`, `settings.json`, `config`, `directory`, `symlink`, `agents`, `skills`, `commands`, `rules`, `plugins`, `keybindings`, `breaking`
- Outputs matching entries since the last check date (stored in `.last-changelog-check`)
- Non-blocking - warns but doesn't prevent anything
- Intended to be run at the start of brainstorm sessions so Claude can assess whether anything needs addressing

### Integration with workflow

A note in the project's CLAUDE.md reminds us to run `./scripts/fetch-docs.sh` at the start of brainstorm sessions.

## 2. Test Fixtures

### Structure

```
tests/fixtures/
├── minimal/                      # Just CLAUDE.md
│   └── .claude/
│       └── CLAUDE.md
│
├── typical/                      # Settings + a few commands and an agent
│   └── .claude/
│       ├── CLAUDE.md
│       ├── settings.json
│       ├── commands/
│       │   └── review.md
│       └── agents/
│           └── helper.md
│
├── full/                         # Everything claudesync supports
│   └── .claude/
│       ├── CLAUDE.md
│       ├── settings.json
│       ├── keybindings.json
│       ├── commands/
│       │   ├── review.md
│       │   └── deploy.md
│       ├── agents/
│       │   └── helper.md
│       ├── skills/
│       │   └── custom-skill/
│       │       └── SKILL.md
│       ├── rules/
│       │   ├── code-style.md
│       │   └── testing.md
│       ├── plugins/
│       │   ├── installed_plugins.json
│       │   ├── known_marketplaces.json
│       │   └── blocklist.json
│       └── projects/
│           └── -Users-test-myproject/
│               ├── CLAUDE.md
│               └── memory/
│                   └── MEMORY.md
│
├── edge-broken-symlinks/         # Dangling symlink (created at test runtime by sandbox helper)
│   └── .claude/
│       └── CLAUDE.md             # Regular file; sandbox.js creates a dangling symlink alongside it
│
├── edge-pre-existing/            # Real files that conflict with symlinks
│   └── .claude/
│       ├── CLAUDE.md
│       ├── settings.json
│       └── commands/
│           └── review.md
│
└── edge-special-chars/           # Files with spaces and unicode in names
    └── .claude/
        ├── CLAUDE.md
        └── commands/
            └── my command (v2).md
```

### Design decisions

- Each fixture is a self-contained fake home directory
- The test runner copies a fixture to a temp location, sets `HOME` to that location, then runs claudesync against it
- Fixtures contain realistic but minimal content - enough to verify behaviour without bloat
- The `full` fixture covers every syncable item confirmed against official Claude Code documentation
- The `edge-broken-symlinks` fixture cannot store dangling symlinks in git; the sandbox helper creates the dangling symlink (`settings.json -> /nonexistent/path`) at test runtime after copying the fixture
- Fixture files contain realistic content: `settings.json` includes example hooks config and permissions, `keybindings.json` contains example key mappings, plugin JSON files mirror the real format from `~/.claude/plugins/`

## 3. Docker Setup

### Files

```
tests/vm/
├── Dockerfile.ubuntu      # Ubuntu 24.04 (primary)
├── Dockerfile.fedora      # Fedora 40
├── Dockerfile.alpine      # Alpine 3.20 (musl libc, ash shell)
├── run-all.sh             # Builds and runs all containers
└── run-single.sh          # Build and run one distro
```

### Container design

Each Dockerfile:
1. Starts from the base distro image
2. Installs Node.js 18+ and bash
3. Creates a non-root test user (catches permission issues)
4. Copies the repo into the container
5. Does not run tests at build time - the test runner handles that

### Test execution

`run-all.sh` runs each distro against each fixture and prints a summary matrix:

```
              minimal  typical  full  edge-broken  edge-existing  edge-special
ubuntu 24.04    PASS     PASS   PASS     PASS         PASS          PASS
fedora 40       PASS     PASS   PASS     PASS         PASS          PASS
alpine 3.20     PASS     PASS   PASS     PASS         PASS          PASS
```

### Key decisions

- Containers are ephemeral - built fresh each run, no state leakage
- Repo is mounted read-only where possible; fixtures are copied so tests can't modify them
- Non-root user ensures permission issues are caught
- Alpine included for musl/ash edge cases

## 4. Integration Tests

### New file: `tests/integration.test.js`

| Check | What it verifies |
|-------|-----------------|
| Import completeness | Every syncable item from the fixture's `.claude/` ends up in `config/` |
| Symlink correctness | Every item in `config/` has a corresponding symlink in `~/.claude/` pointing to the right target |
| Real files in config/ | The real file lives in `config/`, `~/.claude/<item>` is a symlink (via `lstat`) |
| Backup creation | When pre-existing files conflict, backups are created in `backups/` |
| Backup integrity | Backup content matches the original file that was replaced |
| Content accessibility | Reading a file through the symlink returns the same content as reading via `config/` |
| Status command | `claudesync status` reports all green for a correctly linked setup |
| Idempotency | Running setup twice doesn't break anything or create duplicate backups |
| Uninstall safety | Uninstall removes symlinks but doesn't delete the config files |
| Edge: broken symlinks | Gracefully handles dangling symlinks in the source `.claude/` |
| Edge: special characters | Files with spaces and unicode in names are handled correctly |
| Non-destructive guarantee | After any operation, no file that existed before has been deleted without a backup |

### Relationship with existing `e2e.test.js`

The existing `tests/e2e.test.js` covers a basic import-and-symlink flow. The new integration tests supersede it with broader fixture-based coverage. `e2e.test.js` should be removed and its assertions absorbed into `integration.test.js` to avoid duplicate coverage.

### Test helper: `tests/helpers/sandbox.js`

- Creates a temp directory
- Copies a named fixture into it as the fake `HOME`
- Sets `HOME` env var to the temp dir
- For the `edge-broken-symlinks` fixture, creates a dangling symlink (`settings.json -> /nonexistent/path`) after copying
- Returns cleanup function
- Used by both integration tests and Docker containers

## 5. IMPORTABLE_ITEMS Update

### Changes to `cli/import.js`

**Remove:** `hooks` (not a real directory - hooks are configured inside settings.json)

**Add:**
- `keybindings.json` - keyboard shortcuts
- `rules` - user-level rules directory
- Plugin config files (separate list due to nested paths):
  - `plugins/installed_plugins.json`
  - `plugins/known_marketplaces.json`
  - `plugins/blocklist.json`

### Updated code

```js
export const IMPORTABLE_ITEMS = [
  'CLAUDE.md',
  'settings.json',
  'keybindings.json',
  'agents',
  'commands',
  'skills',
  'rules',
];

export const IMPORTABLE_PLUGIN_ITEMS = [
  'plugins/installed_plugins.json',
  'plugins/known_marketplaces.json',
  'plugins/blocklist.json',
];
```

### Changes to `cli/import.js` - `detectConfig()`

The current `detectConfig()` iterates `IMPORTABLE_ITEMS` for top-level items and has separate logic for `projects/`. Add a third block for plugin items:

```js
// After existing IMPORTABLE_ITEMS loop and projects logic:
const pluginItems = [];
for (const item of IMPORTABLE_PLUGIN_ITEMS) {
  const fullPath = path.join(claudeDir, item);
  if (!fs.existsSync(fullPath)) continue;
  const stat = fs.statSync(fullPath);
  pluginItems.push({ name: item, type: 'file', size: stat.size });
}
if (pluginItems.length > 0) {
  found.push({ name: 'plugins (config)', type: 'group', items: pluginItems });
}
```

Similarly, `importConfig()` needs to handle `IMPORTABLE_PLUGIN_ITEMS` by creating `plugins/` parent directory in `configDir` before copying individual files.

### Changes to `cli/link.js` - `buildSymlinkMap()`

Plugin config files are symlinked individually (not the whole `plugins/` directory, since `~/.claude/plugins/` also contains `cache/`, `marketplaces/`, etc. that should not be synced). The symlink map builder adds entries like:

- `~/.claude/plugins/installed_plugins.json` -> `config/plugins/installed_plugins.json`
- `~/.claude/plugins/known_marketplaces.json` -> `config/plugins/known_marketplaces.json`
- `~/.claude/plugins/blocklist.json` -> `config/plugins/blocklist.json`

Before creating these symlinks, ensure `~/.claude/plugins/` directory exists (it may already exist from Claude Code's own usage, but create it if not).

### Changes to `setup.sh`

The bash script needs a new loop for plugin items, structurally different from the flat items:

```bash
# Plugin config files (individual files within plugins/)
PLUGIN_ITEMS="installed_plugins.json known_marketplaces.json blocklist.json"
mkdir -p "$HOME/.claude/plugins"
mkdir -p "$CONFIG_DIR/plugins"
for item in $PLUGIN_ITEMS; do
  src="$CONFIG_DIR/plugins/$item"
  dest="$HOME/.claude/plugins/$item"
  # Same backup-and-symlink logic as top-level items
done
```

### npm script entries

Add to `package.json`:

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:integration": "node --test tests/integration.test.js",
    "test:vm": "./tests/vm/run-all.sh",
    "test:vm:ubuntu": "./tests/vm/run-single.sh ubuntu",
    "fetch-docs": "./scripts/fetch-docs.sh"
  }
}
```

`npm test` continues to run all tests including the new integration tests. `test:vm` is separate since it requires Docker.

## 6. Future-Proofing

### Standalone visualisation app (Tauri) - deferred

The core logic in `cli/import.js` and `cli/link.js` is already structured as pure functions (no CLI prompts mixed in). The Tauri app can import them directly for:
- Detecting what exists in `~/.claude/`
- Showing sync status per item
- Displaying diffs between local and repo versions

### Windows support - deferred

When ready, Docker + fixture approach extends naturally with Vagrant for Windows VMs. Key challenges:
- Symlinks require Developer Mode or admin on Windows
- Path separators in project slugs
- PowerShell equivalent of setup.sh

No action needed now. The existing code already uses `path.join()` and `path.sep` consistently. The main Windows-specific issue to address later is the project slug format: slugs use `-` as path separator replacement (e.g., `-Users-test-myproject` on Unix vs `-C--Users-test-myproject` on Windows).
