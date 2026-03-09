import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectConfig, importConfig, importProjects } from '../cli/import.js';
import { buildSymlinkMap, createSymlink, verifySymlinks } from '../cli/link.js';

describe('e2e: full import and symlink flow', () => {
  let tmpDir;
  let fakeClaudeDir;
  let repoDir;
  let configDir;
  let backupDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-e2e-'));
    fakeClaudeDir = path.join(tmpDir, '.claude');
    repoDir = path.join(tmpDir, 'repo');
    configDir = path.join(repoDir, 'config');

    // Create fake ~/.claude with realistic content
    fs.mkdirSync(fakeClaudeDir, { recursive: true });
    fs.writeFileSync(path.join(fakeClaudeDir, 'CLAUDE.md'), '# My global instructions\n\nUse British English.');
    fs.writeFileSync(path.join(fakeClaudeDir, 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] } }));

    fs.mkdirSync(path.join(fakeClaudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(fakeClaudeDir, 'agents', 'code-reviewer.md'), '# Code Reviewer Agent');
    fs.writeFileSync(path.join(fakeClaudeDir, 'agents', 'debugger.md'), '# Debugger Agent');

    fs.mkdirSync(path.join(fakeClaudeDir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(fakeClaudeDir, 'commands', 'deploy.md'), '# Deploy Command');

    // Per-project data
    const projectSlug = '-Users-test-myproject';
    fs.mkdirSync(path.join(fakeClaudeDir, 'projects', projectSlug, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(fakeClaudeDir, 'projects', projectSlug, 'memory', 'MEMORY.md'), '# Project memory');
    fs.writeFileSync(path.join(fakeClaudeDir, 'projects', projectSlug, 'CLAUDE.md'), '# Project instructions');

    // Excluded items (should NOT be imported)
    fs.writeFileSync(path.join(fakeClaudeDir, '.credentials.json'), '{"secret": "token"}');
    fs.writeFileSync(path.join(fakeClaudeDir, 'history.jsonl'), '{}');
    fs.mkdirSync(path.join(fakeClaudeDir, 'cache'), { recursive: true });

    // Create repo and backup directories
    fs.mkdirSync(configDir, { recursive: true });
    backupDir = path.join(repoDir, 'backups');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects all importable config', () => {
    const found = detectConfig(fakeClaudeDir);

    const names = found.map(f => f.name);
    assert.ok(names.includes('CLAUDE.md'), 'Should detect CLAUDE.md');
    assert.ok(names.includes('settings.json'), 'Should detect settings.json');
    assert.ok(names.includes('agents'), 'Should detect agents/');
    assert.ok(names.includes('commands'), 'Should detect commands/');
    assert.ok(names.includes('projects'), 'Should detect projects/');

    // Should NOT detect excluded items
    assert.ok(!names.includes('.credentials.json'), 'Should not detect .credentials.json');
    assert.ok(!names.includes('history.jsonl'), 'Should not detect history.jsonl');
    assert.ok(!names.includes('cache'), 'Should not detect cache/');
  });

  it('imports top-level config correctly', () => {
    importConfig(fakeClaudeDir, configDir, ['CLAUDE.md', 'settings.json', 'agents', 'commands']);

    assert.ok(fs.existsSync(path.join(configDir, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(configDir, 'settings.json')));
    assert.ok(fs.existsSync(path.join(configDir, 'agents', 'code-reviewer.md')));
    assert.ok(fs.existsSync(path.join(configDir, 'agents', 'debugger.md')));
    assert.ok(fs.existsSync(path.join(configDir, 'commands', 'deploy.md')));

    const content = fs.readFileSync(path.join(configDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('British English'));
  });

  it('imports per-project data correctly', () => {
    const imported = importProjects(fakeClaudeDir, configDir);

    assert.ok(imported.length > 0, 'Should import at least one project item');
    assert.ok(fs.existsSync(path.join(configDir, 'projects', '-Users-test-myproject', 'memory', 'MEMORY.md')));
    assert.ok(fs.existsSync(path.join(configDir, 'projects', '-Users-test-myproject', 'CLAUDE.md')));
  });

  it('creates symlinks from fake claude dir to config', () => {
    const symlinkMap = buildSymlinkMap(configDir, fakeClaudeDir);

    assert.ok(symlinkMap.length > 0, 'Should have symlinks to create');

    for (const { target, link } of symlinkMap) {
      const result = createSymlink(target, link, backupDir);
      assert.ok(result.status === 'created' || result.status === 'skipped',
        `Symlink for ${path.basename(link)} should be created or skipped`);
    }
  });

  it('verifies all symlinks are correct', () => {
    const results = verifySymlinks(configDir, fakeClaudeDir);

    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.item} should be ok, got ${r.status}`);
    }
  });

  it('symlinks resolve to the correct content', () => {
    // Read through the symlink and verify content matches
    const claudeMd = fs.readFileSync(path.join(fakeClaudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('British English'));

    const agentFile = fs.readFileSync(path.join(fakeClaudeDir, 'agents', 'code-reviewer.md'), 'utf-8');
    assert.equal(agentFile, '# Code Reviewer Agent');
  });
});
