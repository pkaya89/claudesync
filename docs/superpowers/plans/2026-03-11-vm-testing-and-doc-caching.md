# VM Testing, Config Updates, and Integration Tests - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add test fixtures, Docker-based Linux testing, integration tests, and update syncable config items to match current Claude Code directory structure.

**Architecture:** Four sequential tasks building on each other. IMPORTABLE_ITEMS update first, then fixtures, then sandbox helper + integration tests, then Docker setup.

**Tech Stack:** Bash (scripts), Node.js 18+ (tests), Docker (VM testing)

**Spec:** `docs/superpowers/specs/2026-03-11-vm-testing-and-doc-caching-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `tests/helpers/sandbox.js` | Creates temp dir from fixture, sets HOME, returns cleanup fn |
| `tests/integration.test.js` | Fixture-based integration tests for import, symlink, backup, status, uninstall |
| `tests/fixtures/minimal/.claude/CLAUDE.md` | Minimal fixture |
| `tests/fixtures/typical/.claude/CLAUDE.md` | Typical fixture (+ settings.json, commands/, agents/) |
| `tests/fixtures/typical/.claude/settings.json` | |
| `tests/fixtures/typical/.claude/commands/review.md` | |
| `tests/fixtures/typical/.claude/agents/helper.md` | |
| `tests/fixtures/full/.claude/CLAUDE.md` | Full fixture (every syncable item) |
| `tests/fixtures/full/.claude/settings.json` | |
| `tests/fixtures/full/.claude/keybindings.json` | |
| `tests/fixtures/full/.claude/commands/review.md` | |
| `tests/fixtures/full/.claude/commands/deploy.md` | |
| `tests/fixtures/full/.claude/agents/helper.md` | |
| `tests/fixtures/full/.claude/skills/custom-skill/SKILL.md` | |
| `tests/fixtures/full/.claude/rules/code-style.md` | |
| `tests/fixtures/full/.claude/rules/testing.md` | |
| `tests/fixtures/full/.claude/plugins/installed_plugins.json` | |
| `tests/fixtures/full/.claude/plugins/known_marketplaces.json` | |
| `tests/fixtures/full/.claude/plugins/blocklist.json` | |
| `tests/fixtures/full/.claude/projects/-Users-test-myproject/CLAUDE.md` | |
| `tests/fixtures/full/.claude/projects/-Users-test-myproject/memory/MEMORY.md` | |
| `tests/fixtures/edge-broken-symlinks/.claude/CLAUDE.md` | Edge case fixture |
| `tests/fixtures/edge-pre-existing/.claude/CLAUDE.md` | Edge case fixture |
| `tests/fixtures/edge-pre-existing/.claude/settings.json` | |
| `tests/fixtures/edge-pre-existing/.claude/commands/review.md` | |
| `tests/fixtures/edge-special-chars/.claude/CLAUDE.md` | Edge case fixture |
| `tests/fixtures/edge-special-chars/.claude/commands/my command (v2).md` | |
| `tests/vm/Dockerfile.ubuntu` | Ubuntu 24.04 container |
| `tests/vm/Dockerfile.fedora` | Fedora 40 container |
| `tests/vm/Dockerfile.alpine` | Alpine 3.20 container |
| `tests/vm/run-all.sh` | Orchestrates all distros x all fixtures |
| `tests/vm/run-single.sh` | Run one distro |

### Modified files

| File | Changes |
|------|---------|
| `cli/import.js` | Update IMPORTABLE_ITEMS (add keybindings.json, rules; remove hooks), add IMPORTABLE_PLUGIN_ITEMS, update detectConfig() and importConfig() |
| `cli/link.js` | Update SYMLINK_ITEMS (add keybindings.json, rules; remove hooks), add SYMLINK_PLUGIN_ITEMS, update buildSymlinkMap() |
| `setup.sh` | Update item lists, add plugin config loop |
| `package.json` | Add npm script entries for test:integration, test:vm |
| `tests/import.test.js` | Update assertions for new items |
| `tests/link.test.js` | Update assertions for new items |

### Removed files

| File | Reason |
|------|--------|
| `tests/e2e.test.js` | Superseded by integration.test.js |

---

## Chunk 1: IMPORTABLE_ITEMS Update

### Task 1: Update cli/import.js - item lists and detectConfig

**Files:**
- Modify: `cli/import.js:4-11` (IMPORTABLE_ITEMS)
- Modify: `cli/import.js:13-45` (detectConfig)
- Modify: `cli/import.js:47-70` (importConfig)
- Test: `tests/import.test.js`

- [ ] **Step 1: Write failing test for new items in detectConfig**

Add to `tests/import.test.js`, inside the `detectConfig` describe block:

```js
it('detects keybindings.json when present', () => {
    fs.writeFileSync(path.join(claudeDir, 'keybindings.json'), '{}');
    const found = detectConfig(claudeDir);
    assert.ok(found.some(f => f.name === 'keybindings.json'));
});

it('detects rules/ directory when present', () => {
    fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'rules', 'code-style.md'), '# Style');
    const found = detectConfig(claudeDir);
    assert.ok(found.some(f => f.name === 'rules'));
});

it('detects plugin config files when present', () => {
    fs.mkdirSync(path.join(claudeDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), '[]');
    fs.writeFileSync(path.join(claudeDir, 'plugins', 'blocklist.json'), '{}');
    const found = detectConfig(claudeDir);
    assert.ok(found.some(f => f.name === 'plugins (config)'));
});

it('does not detect hooks/ (not a real directory)', () => {
    fs.mkdirSync(path.join(claudeDir, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'hooks', 'pre-commit.sh'), '#!/bin/bash');
    const found = detectConfig(claudeDir);
    assert.ok(!found.some(f => f.name === 'hooks'), 'Should not detect hooks/');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: New tests fail (keybindings.json and rules not in IMPORTABLE_ITEMS, no plugin detection, hooks still detected)

- [ ] **Step 3: Update IMPORTABLE_ITEMS and add IMPORTABLE_PLUGIN_ITEMS**

In `cli/import.js`, replace lines 4-11:

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

- [ ] **Step 4: Update detectConfig to handle plugin items**

In `cli/import.js`, add after the projects block (before `return found;`):

```js
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

- [ ] **Step 5: Update importConfig to handle plugin items**

Add a new exported function in `cli/import.js`:

```js
export function importPluginConfig(claudeDir, configDir) {
  const imported = [];
  for (const item of IMPORTABLE_PLUGIN_ITEMS) {
    const src = path.join(claudeDir, item);
    const dest = path.join(configDir, item);

    const srcStat = fs.lstatSync(src, { throwIfNoEntry: false });
    if (!srcStat) continue;
    if (srcStat.isSymbolicLink() && fs.readlinkSync(src) === dest) continue;

    const destStat = fs.lstatSync(dest, { throwIfNoEntry: false });
    if (destStat) fs.rmSync(dest, { force: true });

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    imported.push(item);
  }
  return imported;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add cli/import.js tests/import.test.js
git commit -m "Update IMPORTABLE_ITEMS: add keybindings.json, rules, plugins; remove hooks"
```

### Task 2: Update cli/link.js - symlink items and buildSymlinkMap

**Files:**
- Modify: `cli/link.js:5-12` (SYMLINK_ITEMS)
- Modify: `cli/link.js:18-54` (buildSymlinkMap)
- Test: `tests/link.test.js`

- [ ] **Step 1: Write failing test for plugin symlinks**

Add to `tests/link.test.js`:

```js
import { SYMLINK_ITEMS, SYMLINK_PLUGIN_ITEMS } from '../cli/link.js';

it('SYMLINK_ITEMS includes rules and keybindings.json but not hooks', () => {
    assert.ok(SYMLINK_ITEMS.includes('rules'));
    assert.ok(SYMLINK_ITEMS.includes('keybindings.json'));
    assert.ok(!SYMLINK_ITEMS.includes('hooks'));
});

it('builds symlink map including plugin config files', () => {
    // Create plugin config in config dir
    fs.mkdirSync(path.join(configDir, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(configDir, 'plugins', 'installed_plugins.json'), '[]');

    const map = buildSymlinkMap(configDir, claudeDir);
    const pluginLinks = map.filter(m => m.target.includes('plugins'));
    assert.ok(pluginLinks.length > 0, 'Should include plugin config symlinks');
    assert.ok(pluginLinks[0].link.includes(path.join('.claude', 'plugins')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: SYMLINK_ITEMS assertions fail, no plugin symlinks in map

- [ ] **Step 3: Update SYMLINK_ITEMS and buildSymlinkMap**

In `cli/link.js`, replace lines 4-12:

```js
// Top-level items to symlink (relative to ~/.claude and config/)
export const SYMLINK_ITEMS = [
  'CLAUDE.md',
  'settings.json',
  'keybindings.json',
  'agents',
  'commands',
  'skills',
  'rules',
];

export const SYMLINK_PLUGIN_ITEMS = [
  'plugins/installed_plugins.json',
  'plugins/known_marketplaces.json',
  'plugins/blocklist.json',
];
```

In `buildSymlinkMap`, add after the SYMLINK_ITEMS loop (before the projects block):

```js
  // Plugin config files (individual symlinks, not the whole plugins/ dir)
  for (const item of SYMLINK_PLUGIN_ITEMS) {
    const target = path.join(configDir, item);
    if (fs.existsSync(target)) {
      map.push({ target, link: path.join(claudeDir, item) });
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add cli/link.js tests/link.test.js
git commit -m "Update SYMLINK_ITEMS: add keybindings.json, rules, plugins; remove hooks"
```

### Task 3: Update setup.sh

**Files:**
- Modify: `setup.sh:66` (import items array)
- Modify: `setup.sh:125` (symlink loop)

- [ ] **Step 1: Update import_config items list**

In `setup.sh`, replace line 66:

```bash
    local items=("CLAUDE.md" "settings.json" "keybindings.json" "agents" "commands" "skills" "rules")
```

Add after the items loop (around line 74), still inside `import_config()`:

```bash
    # Plugin config files
    local plugin_items=("installed_plugins.json" "known_marketplaces.json" "blocklist.json")
    for item in "${plugin_items[@]}"; do
        local src="$CLAUDE_DIR/plugins/$item"
        local dest="$CONFIG_DIR/plugins/$item"
        if [ -e "$src" ] && [ ! -L "$src" ]; then
            mkdir -p "$CONFIG_DIR/plugins"
            cp "$src" "$dest"
            success "Imported plugins/$item"
        fi
    done
```

- [ ] **Step 2: Update symlink loop**

In `setup.sh`, replace line 125:

```bash
for item in CLAUDE.md settings.json keybindings.json agents commands skills rules; do
```

Add after the top-level symlink loop (around line 130), before the per-project block:

```bash
# Plugin config file symlinks
for item in installed_plugins.json known_marketplaces.json blocklist.json; do
    target="$CONFIG_DIR/plugins/$item"
    link="$CLAUDE_DIR/plugins/$item"
    if [ -e "$target" ]; then
        mkdir -p "$CLAUDE_DIR/plugins"
        create_symlink "$target" "$link"
    fi
done
```

- [ ] **Step 3: Commit**

```bash
git add setup.sh
git commit -m "Update setup.sh: add keybindings.json, rules, plugins; remove hooks"
```

### Task 4: Update cli/index.js to handle plugin imports

**Files:**
- Modify: `cli/index.js:7` (import statement)
- Modify: `cli/index.js:96-104` (init - import all)
- Modify: `cli/index.js:122-130` (init - import selected)

- [ ] **Step 1: Update import statement**

In `cli/index.js`, line 7, add `importPluginConfig`:

```js
import { detectConfig, importConfig, importProjects, importPluginConfig } from './import.js';
```

- [ ] **Step 2: Add display handling for group type**

In `cli/index.js`, update the display logic (around line 74-80) to handle the new `group` type:

```js
      for (const item of found) {
        if (item.type === 'directory') {
          p.log.message(`  ${item.name}/ (${item.count} ${item.count === 1 ? 'item' : 'items'})`);
        } else if (item.type === 'group') {
          p.log.message(`  ${item.name} (${item.items.length} ${item.items.length === 1 ? 'file' : 'files'})`);
        } else {
          p.log.message(`  ${item.name} (${formatSize(item.size)})`);
        }
      }
```

- [ ] **Step 3: Update "import all" path to exclude plugins from topLevel and add separate call**

In `cli/index.js`, update the "import all" path (around line 100):

```js
        const topLevel = found.filter(f => f.name !== 'projects' && f.name !== 'plugins (config)').map(f => f.name);
        importConfig(CLAUDE_DIR, configDir, topLevel);
        if (found.some(f => f.name === 'projects')) {
          importProjects(CLAUDE_DIR, configDir);
        }
        if (found.some(f => f.name === 'plugins (config)')) {
          importPluginConfig(CLAUDE_DIR, configDir);
        }
```

- [ ] **Step 4: Update "import selected" path to exclude plugins from topLevel and add separate call**

In `cli/index.js`, update the "choose" path (around line 125):

```js
        const topLevel = selected.filter(n => n !== 'projects' && n !== 'plugins (config)');
        importConfig(CLAUDE_DIR, configDir, topLevel);
        if (selected.includes('projects')) {
          importProjects(CLAUDE_DIR, configDir);
        }
        if (selected.includes('plugins (config)')) {
          importPluginConfig(CLAUDE_DIR, configDir);
        }
```

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add cli/index.js
git commit -m "Wire up plugin config import in CLI init flow"
```

---

## Chunk 2: Test Fixtures

### Task 5: Create minimal fixture

**Files:**
- Create: `tests/fixtures/minimal/.claude/CLAUDE.md`

- [ ] **Step 1: Create fixture file**

```markdown
# Global Instructions

Use British English in all output.
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/minimal/
git commit -m "Add minimal test fixture"
```

### Task 6: Create typical fixture

**Files:**
- Create: `tests/fixtures/typical/.claude/CLAUDE.md`
- Create: `tests/fixtures/typical/.claude/settings.json`
- Create: `tests/fixtures/typical/.claude/commands/review.md`
- Create: `tests/fixtures/typical/.claude/agents/helper.md`

- [ ] **Step 1: Create fixture files**

`tests/fixtures/typical/.claude/CLAUDE.md`:
```markdown
# Global Instructions

Use British English in all output.
Always run tests before committing.
```

`tests/fixtures/typical/.claude/settings.json`:
```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep"],
    "deny": []
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Bash tool used'"
          }
        ]
      }
    ]
  }
}
```

`tests/fixtures/typical/.claude/commands/review.md`:
```markdown
Review the current git diff and provide feedback on code quality, potential bugs, and style issues.
```

`tests/fixtures/typical/.claude/agents/helper.md`:
```markdown
---
name: helper
description: A general-purpose helper agent
---

You are a helpful assistant that answers questions concisely.
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/typical/
git commit -m "Add typical test fixture"
```

### Task 7: Create full fixture

**Files:**
- Create: all files listed under `tests/fixtures/full/` in the file structure table above

- [ ] **Step 1: Create all fixture files**

`tests/fixtures/full/.claude/CLAUDE.md`:
```markdown
# Global Instructions

Use British English in all output.
Always run tests before committing.
Prefer functional programming patterns.
```

`tests/fixtures/full/.claude/settings.json`:
```json
{
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "Bash"],
    "deny": []
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Bash tool used'"
          }
        ]
      }
    ]
  },
  "autoMemoryEnabled": true
}
```

`tests/fixtures/full/.claude/keybindings.json`:
```json
{
  "bindings": [
    {
      "key": "ctrl+s",
      "command": "submit"
    },
    {
      "key": "ctrl+shift+p",
      "command": "command_palette"
    }
  ]
}
```

`tests/fixtures/full/.claude/commands/review.md`:
```markdown
Review the current git diff and provide feedback.
```

`tests/fixtures/full/.claude/commands/deploy.md`:
```markdown
Run the deployment script for the current project.
```

`tests/fixtures/full/.claude/agents/helper.md`:
```markdown
---
name: helper
description: A general-purpose helper agent
---

You are a helpful assistant.
```

`tests/fixtures/full/.claude/skills/custom-skill/SKILL.md`:
```markdown
---
name: custom-skill
description: A custom skill for testing
---

This is a test skill that does nothing useful.
```

`tests/fixtures/full/.claude/rules/code-style.md`:
```markdown
- Use 2-space indentation
- Prefer const over let
- No semicolons
```

`tests/fixtures/full/.claude/rules/testing.md`:
```markdown
- Write tests before implementation
- Use descriptive test names
- One assertion per test where practical
```

`tests/fixtures/full/.claude/plugins/installed_plugins.json`:
```json
[
  {
    "name": "superpowers",
    "version": "5.0.1",
    "marketplace": "official"
  }
]
```

`tests/fixtures/full/.claude/plugins/known_marketplaces.json`:
```json
{
  "official": {
    "url": "https://github.com/anthropics/claude-plugins-official",
    "name": "Official Anthropic Plugins"
  }
}
```

`tests/fixtures/full/.claude/plugins/blocklist.json`:
```json
{
  "blocked": []
}
```

`tests/fixtures/full/.claude/projects/-Users-test-myproject/CLAUDE.md`:
```markdown
# Project Instructions

This is a test project for claudesync integration tests.
```

`tests/fixtures/full/.claude/projects/-Users-test-myproject/memory/MEMORY.md`:
```markdown
# Memory

- This project uses Node.js 18+
- Tests use the built-in test runner
```

- [ ] **Step 2: Commit**

```bash
git add tests/fixtures/full/
git commit -m "Add full test fixture with all syncable items"
```

### Task 8: Create edge case fixtures

**Files:**
- Create: `tests/fixtures/edge-broken-symlinks/.claude/CLAUDE.md`
- Create: `tests/fixtures/edge-pre-existing/.claude/CLAUDE.md`
- Create: `tests/fixtures/edge-pre-existing/.claude/settings.json`
- Create: `tests/fixtures/edge-pre-existing/.claude/commands/review.md`
- Create: `tests/fixtures/edge-special-chars/.claude/CLAUDE.md`
- Create: `tests/fixtures/edge-special-chars/.claude/commands/my command (v2).md`

- [ ] **Step 1: Create edge-broken-symlinks**

`tests/fixtures/edge-broken-symlinks/.claude/CLAUDE.md`:
```markdown
# Test fixture for broken symlinks

The sandbox helper will create a dangling symlink alongside this file at test runtime.
```

Note: The dangling symlink (`settings.json -> /nonexistent/path`) is created by `sandbox.js` at test runtime since git cannot reliably store dangling symlinks.

- [ ] **Step 2: Create edge-pre-existing**

`tests/fixtures/edge-pre-existing/.claude/CLAUDE.md`:
```markdown
# Pre-existing config

This simulates a user who already has config that will conflict with symlinks.
```

`tests/fixtures/edge-pre-existing/.claude/settings.json`:
```json
{
  "permissions": {
    "allow": ["Read"]
  }
}
```

`tests/fixtures/edge-pre-existing/.claude/commands/review.md`:
```markdown
Existing review command that should be backed up.
```

- [ ] **Step 3: Create edge-special-chars**

`tests/fixtures/edge-special-chars/.claude/CLAUDE.md`:
```markdown
# Special characters test
```

`tests/fixtures/edge-special-chars/.claude/commands/my command (v2).md`:
```markdown
A command with spaces and parentheses in the filename.
```

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/edge-broken-symlinks/ tests/fixtures/edge-pre-existing/ tests/fixtures/edge-special-chars/
git commit -m "Add edge case test fixtures"
```

---

## Chunk 3: Sandbox Helper and Integration Tests

### Task 9: Create sandbox helper

**Files:**
- Create: `tests/helpers/sandbox.js`

- [ ] **Step 1: Create the sandbox module**

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * Create an isolated test environment from a named fixture.
 * Returns { tmpDir, homeDir, claudeDir, repoDir, configDir, backupDir, cleanup }.
 */
export function createSandbox(fixtureName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `claudesync-${fixtureName}-`));
  const homeDir = path.join(tmpDir, 'home');
  const claudeDir = path.join(homeDir, '.claude');
  const repoDir = path.join(tmpDir, 'repo');
  const configDir = path.join(repoDir, 'config');
  const backupDir = path.join(repoDir, 'backups');

  // Copy fixture to fake home
  const fixtureSrc = path.join(FIXTURES_DIR, fixtureName, '.claude');
  if (fs.existsSync(fixtureSrc)) {
    fs.cpSync(fixtureSrc, claudeDir, { recursive: true });
  }
  fs.mkdirSync(claudeDir, { recursive: true });

  // Create repo dir
  fs.mkdirSync(configDir, { recursive: true });

  // Edge case: create dangling symlink for broken-symlinks fixture
  if (fixtureName === 'edge-broken-symlinks') {
    fs.symlinkSync('/nonexistent/path', path.join(claudeDir, 'settings.json'));
  }

  // Store original HOME
  const originalHome = process.env.HOME;

  return {
    tmpDir,
    homeDir,
    claudeDir,
    configDir,
    repoDir,
    backupDir,
    activate() {
      process.env.HOME = homeDir;
    },
    cleanup() {
      process.env.HOME = originalHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * List all available fixture names.
 */
export function listFixtures() {
  return fs.readdirSync(FIXTURES_DIR).filter(f =>
    fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory()
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/sandbox.js
git commit -m "Add sandbox test helper for fixture-based testing"
```

### Task 10: Create integration tests

**Files:**
- Create: `tests/integration.test.js`
- Remove: `tests/e2e.test.js`

- [ ] **Step 1: Create integration test file**

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSandbox } from './helpers/sandbox.js';
import { detectConfig, importConfig, importProjects, importPluginConfig, IMPORTABLE_ITEMS, IMPORTABLE_PLUGIN_ITEMS } from '../cli/import.js';
import { buildSymlinkMap, createSymlink, verifySymlinks, removeSymlinks, SYMLINK_ITEMS, SYMLINK_PLUGIN_ITEMS } from '../cli/link.js';

// --- Minimal fixture ---

describe('integration: minimal fixture', () => {
  let sandbox;

  before(() => {
    sandbox = createSandbox('minimal');
  });

  after(() => {
    sandbox.cleanup();
  });

  it('detects CLAUDE.md', () => {
    const found = detectConfig(sandbox.claudeDir);
    assert.ok(found.some(f => f.name === 'CLAUDE.md'));
  });

  it('imports and symlinks correctly', () => {
    const found = detectConfig(sandbox.claudeDir);
    const topLevel = found.filter(f => f.name !== 'projects' && f.name !== 'plugins (config)').map(f => f.name);
    importConfig(sandbox.claudeDir, sandbox.configDir, topLevel);

    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      createSymlink(target, link, sandbox.backupDir);
    }

    const results = verifySymlinks(sandbox.configDir, sandbox.claudeDir);
    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.item} should be ok`);
    }
  });
});

// --- Full fixture ---

describe('integration: full fixture', () => {
  let sandbox;

  before(() => {
    sandbox = createSandbox('full');
  });

  after(() => {
    sandbox.cleanup();
  });

  it('detects all importable items', () => {
    const found = detectConfig(sandbox.claudeDir);
    const names = found.map(f => f.name);

    assert.ok(names.includes('CLAUDE.md'));
    assert.ok(names.includes('settings.json'));
    assert.ok(names.includes('keybindings.json'));
    assert.ok(names.includes('agents'));
    assert.ok(names.includes('commands'));
    assert.ok(names.includes('skills'));
    assert.ok(names.includes('rules'));
    assert.ok(names.includes('projects'));
    assert.ok(names.includes('plugins (config)'));
  });

  it('imports all config to config/', () => {
    const found = detectConfig(sandbox.claudeDir);
    const topLevel = found
      .filter(f => f.name !== 'projects' && f.name !== 'plugins (config)')
      .map(f => f.name);

    importConfig(sandbox.claudeDir, sandbox.configDir, topLevel);
    importProjects(sandbox.claudeDir, sandbox.configDir);
    importPluginConfig(sandbox.claudeDir, sandbox.configDir);

    // Verify all top-level items exist in config/
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'settings.json')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'keybindings.json')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'agents', 'helper.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'commands', 'review.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'skills', 'custom-skill', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'rules', 'code-style.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'plugins', 'installed_plugins.json')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'projects', '-Users-test-myproject', 'memory', 'MEMORY.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'projects', '-Users-test-myproject', 'CLAUDE.md')));
  });

  it('creates symlinks and all verify as ok', () => {
    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      createSymlink(target, link, sandbox.backupDir);
    }

    const results = verifySymlinks(sandbox.configDir, sandbox.claudeDir);
    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.item} should be ok`);
    }
  });

  it('real files live in config/, symlinks in .claude/', () => {
    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      // target (in config/) should be a real file/dir
      const targetStat = fs.lstatSync(target);
      assert.ok(!targetStat.isSymbolicLink(), `${target} should not be a symlink`);

      // link (in .claude/) should be a symlink
      const linkStat = fs.lstatSync(link);
      assert.ok(linkStat.isSymbolicLink(), `${link} should be a symlink`);
    }
  });

  it('content is accessible through symlinks', () => {
    const claudeMd = fs.readFileSync(path.join(sandbox.claudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('British English'));

    const configClaudeMd = fs.readFileSync(path.join(sandbox.configDir, 'CLAUDE.md'), 'utf-8');
    assert.equal(claudeMd, configClaudeMd);
  });

  it('idempotent - running setup twice does not break anything', () => {
    // Run symlink creation again
    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      const result = createSymlink(target, link, sandbox.backupDir);
      assert.equal(result.status, 'skipped', `${path.basename(link)} should be skipped on second run`);
    }

    const results = verifySymlinks(sandbox.configDir, sandbox.claudeDir);
    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.item} should still be ok`);
    }
  });

  it('does not detect excluded items', () => {
    // Create items that should not be importable
    fs.writeFileSync(path.join(sandbox.claudeDir, '.credentials.json'), '{"secret": "token"}');
    fs.writeFileSync(path.join(sandbox.claudeDir, 'history.jsonl'), '{}');
    fs.mkdirSync(path.join(sandbox.claudeDir, 'cache'), { recursive: true });
    const found = detectConfig(sandbox.claudeDir);
    const names = found.map(f => f.name);
    assert.ok(!names.includes('.credentials.json'));
    assert.ok(!names.includes('history.jsonl'));
    assert.ok(!names.includes('cache'));
  });

  it('uninstall removes symlinks but keeps config files', () => {
    const removed = removeSymlinks(sandbox.configDir, sandbox.claudeDir);
    assert.ok(removed.some(r => r.status === 'removed'));

    // Config files should still exist
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'settings.json')));
    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'plugins', 'installed_plugins.json')));
  });
});

// --- Edge case: pre-existing files ---

describe('integration: edge-pre-existing fixture', () => {
  let sandbox;

  before(() => {
    sandbox = createSandbox('edge-pre-existing');
  });

  after(() => {
    sandbox.cleanup();
  });

  it('backs up pre-existing files before creating symlinks', () => {
    // Import first
    const found = detectConfig(sandbox.claudeDir);
    const topLevel = found
      .filter(f => f.name !== 'projects' && f.name !== 'plugins (config)')
      .map(f => f.name);
    importConfig(sandbox.claudeDir, sandbox.configDir, topLevel);

    // Now create symlinks - existing files should be backed up
    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    const backups = [];
    for (const { target, link } of map) {
      const result = createSymlink(target, link, sandbox.backupDir);
      if (result.backedUp) backups.push(result);
    }

    assert.ok(backups.length > 0, 'Should have backed up at least one file');
    assert.ok(fs.existsSync(sandbox.backupDir), 'Backup directory should exist');

    // Verify backup content matches original
    const backupFiles = fs.readdirSync(sandbox.backupDir);
    assert.ok(backupFiles.length > 0, 'Backup directory should not be empty');
  });
});

// --- Edge case: broken symlinks ---

describe('integration: edge-broken-symlinks fixture', () => {
  let sandbox;

  before(() => {
    sandbox = createSandbox('edge-broken-symlinks');
  });

  after(() => {
    sandbox.cleanup();
  });

  it('handles dangling symlinks gracefully during import', () => {
    // The sandbox creates a dangling symlink at settings.json
    const settingsPath = path.join(sandbox.claudeDir, 'settings.json');
    const stat = fs.lstatSync(settingsPath, { throwIfNoEntry: false });
    assert.ok(stat?.isSymbolicLink(), 'settings.json should be a dangling symlink');

    // detectConfig should not crash
    const found = detectConfig(sandbox.claudeDir);
    assert.ok(Array.isArray(found));
  });
});

// --- Edge case: special characters ---

describe('integration: edge-special-chars fixture', () => {
  let sandbox;

  before(() => {
    sandbox = createSandbox('edge-special-chars');
  });

  after(() => {
    sandbox.cleanup();
  });

  it('imports and symlinks files with spaces and parentheses', () => {
    const found = detectConfig(sandbox.claudeDir);
    const topLevel = found
      .filter(f => f.name !== 'projects' && f.name !== 'plugins (config)')
      .map(f => f.name);
    importConfig(sandbox.claudeDir, sandbox.configDir, topLevel);

    assert.ok(fs.existsSync(path.join(sandbox.configDir, 'commands', 'my command (v2).md')));

    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      createSymlink(target, link, sandbox.backupDir);
    }

    const results = verifySymlinks(sandbox.configDir, sandbox.claudeDir);
    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.item} should be ok`);
    }
  });
});

// --- Non-destructive guarantee ---

describe('integration: non-destructive guarantee', () => {
  let sandbox;
  let filesBefore;

  function listAllFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      const fullPath = path.join(entry.parentPath || entry.path, entry.name);
      if (!entry.isDirectory()) {
        files.push(path.relative(dir, fullPath));
      }
    }
    return files.sort();
  }

  before(() => {
    sandbox = createSandbox('edge-pre-existing');
    // Snapshot all files before any operations
    filesBefore = listAllFiles(sandbox.claudeDir);
  });

  after(() => {
    sandbox.cleanup();
  });

  it('no original file is deleted without a backup existing', () => {
    // Import
    const found = detectConfig(sandbox.claudeDir);
    const topLevel = found
      .filter(f => f.name !== 'projects' && f.name !== 'plugins (config)')
      .map(f => f.name);
    importConfig(sandbox.claudeDir, sandbox.configDir, topLevel);

    // Create symlinks (replaces originals with symlinks)
    const map = buildSymlinkMap(sandbox.configDir, sandbox.claudeDir);
    for (const { target, link } of map) {
      createSymlink(target, link, sandbox.backupDir);
    }

    // For every file that existed before, it should either:
    // 1. Still exist (possibly as a symlink now), OR
    // 2. Have a corresponding backup
    const backupFiles = fs.existsSync(sandbox.backupDir)
      ? fs.readdirSync(sandbox.backupDir)
      : [];

    for (const file of filesBefore) {
      const stillExists = fs.existsSync(path.join(sandbox.claudeDir, file));
      const hasBackup = backupFiles.some(b => b.includes(file.replaceAll(path.sep, '--').replace(/\//g, '--')));
      assert.ok(
        stillExists || hasBackup,
        `${file} was deleted without a backup`
      );
    }
  });
});
```

- [ ] **Step 2: Remove e2e.test.js**

Run: `rm tests/e2e.test.js`

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: All unit tests and integration tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/integration.test.js tests/helpers/sandbox.js
git rm tests/e2e.test.js
git commit -m "Replace e2e tests with fixture-based integration tests"
```

---

## Chunk 4: Docker Setup

### Task 11: Create .dockerignore and Dockerfiles

**Files:**
- Create: `.dockerignore`
- Create: `tests/vm/Dockerfile.ubuntu`
- Create: `tests/vm/Dockerfile.fedora`
- Create: `tests/vm/Dockerfile.alpine`

- [ ] **Step 1: Create .dockerignore**

```
node_modules/
.git/
docs/
.DS_Store
*.swp
*.swo
```

- [ ] **Step 2: Create Dockerfile.ubuntu**

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y nodejs npm bash && rm -rf /var/lib/apt/lists/*
RUN useradd -m testuser
COPY . /opt/claudesync
RUN chown -R testuser:testuser /opt/claudesync
USER testuser
WORKDIR /opt/claudesync
RUN npm install --ignore-scripts
CMD ["npm", "test"]
```

- [ ] **Step 3: Create Dockerfile.fedora**

```dockerfile
FROM fedora:40
RUN dnf install -y nodejs npm bash && dnf clean all
RUN useradd -m testuser
COPY . /opt/claudesync
RUN chown -R testuser:testuser /opt/claudesync
USER testuser
WORKDIR /opt/claudesync
RUN npm install --ignore-scripts
CMD ["npm", "test"]
```

- [ ] **Step 4: Create Dockerfile.alpine**

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache nodejs npm bash
RUN adduser -D testuser
COPY . /opt/claudesync
RUN chown -R testuser:testuser /opt/claudesync
USER testuser
WORKDIR /opt/claudesync
RUN npm install --ignore-scripts
CMD ["npm", "test"]
```

- [ ] **Step 5: Commit**

```bash
git add .dockerignore tests/vm/Dockerfile.*
git commit -m "Add .dockerignore and Dockerfiles for Ubuntu, Fedora, and Alpine"
```

### Task 12: Create run-single.sh

**Files:**
- Create: `tests/vm/run-single.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# run-single.sh - Build and run tests in a single distro container.
# Usage: ./tests/vm/run-single.sh <distro>
# Example: ./tests/vm/run-single.sh ubuntu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DISTRO="${1:?Usage: run-single.sh <ubuntu|fedora|alpine>}"

DOCKERFILE="$SCRIPT_DIR/Dockerfile.$DISTRO"
if [ ! -f "$DOCKERFILE" ]; then
    echo "Error: No Dockerfile found for '$DISTRO' at $DOCKERFILE"
    exit 1
fi

IMAGE_NAME="claudesync-test-$DISTRO"

echo "Building $DISTRO image..."
docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" "$REPO_DIR"

echo ""
echo "Running tests on $DISTRO..."
docker run --rm "$IMAGE_NAME"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x tests/vm/run-single.sh`

- [ ] **Step 3: Commit**

```bash
git add tests/vm/run-single.sh
git commit -m "Add run-single.sh for testing in individual Docker containers"
```

### Task 13: Create run-all.sh

**Files:**
- Create: `tests/vm/run-all.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -uo pipefail

# run-all.sh - Build and run tests across all distros.
# Usage: ./tests/vm/run-all.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

DISTROS=("ubuntu" "fedora" "alpine")
PASS=0
FAIL=0
RESULTS=()

for distro in "${DISTROS[@]}"; do
    echo "=============================="
    echo "  Testing on: $distro"
    echo "=============================="

    IMAGE_NAME="claudesync-test-$distro"
    DOCKERFILE="$SCRIPT_DIR/Dockerfile.$distro"

    if ! docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" "$REPO_DIR" > /dev/null 2>&1; then
        echo "  BUILD FAILED"
        RESULTS+=("$distro: BUILD FAILED")
        FAIL=$((FAIL + 1))
        continue
    fi

    if docker run --rm "$IMAGE_NAME" 2>&1; then
        RESULTS+=("$distro: PASS")
        PASS=$((PASS + 1))
    else
        RESULTS+=("$distro: FAIL")
        FAIL=$((FAIL + 1))
    fi

    echo ""
done

echo "=============================="
echo "  Summary"
echo "=============================="
for result in "${RESULTS[@]}"; do
    echo "  $result"
done
echo ""
echo "  Passed: $PASS / $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
```

- [ ] **Step 2: Make executable**

Run: `chmod +x tests/vm/run-all.sh`

- [ ] **Step 3: Test with one distro** (optional, requires Docker)

Run: `./tests/vm/run-single.sh ubuntu`
Expected: Image builds, tests run and pass inside container

- [ ] **Step 4: Commit**

```bash
git add tests/vm/run-all.sh
git commit -m "Add run-all.sh for cross-distro Docker testing"
```

### Task 14: Final verification

- [ ] **Step 1: Run full local test suite**

Run: `npm test`
Expected: All unit and integration tests pass

- [ ] **Step 2: Run Docker tests** (requires Docker)

Run: `npm run test:vm`
Expected: All three distros pass

- [ ] **Step 3: Verify fetch-docs works**

Run: `npm run fetch-docs -- --force`
Expected: 12 pages fetched, changelog check runs

- [ ] **Step 4: Final commit if any loose changes**

```bash
git status
# If anything unstaged, add and commit
```
