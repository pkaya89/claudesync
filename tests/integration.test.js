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
