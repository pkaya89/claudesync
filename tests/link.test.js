import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSymlink, verifySymlinks, buildSymlinkMap, SYMLINK_ITEMS } from '../cli/link.js';

describe('createSymlink', () => {
  let tmpDir;
  let claudeDir;
  let configDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-test-'));
    claudeDir = path.join(tmpDir, '.claude');
    configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a symlink for a file', () => {
    const target = path.join(configDir, 'CLAUDE.md');
    const link = path.join(claudeDir, 'CLAUDE.md');
    fs.writeFileSync(target, '# Test');

    const result = createSymlink(target, link);

    assert.equal(result.status, 'created');
    assert.equal(fs.readlinkSync(link), target);
  });

  it('skips if symlink already points correctly', () => {
    const target = path.join(configDir, 'settings.json');
    const link = path.join(claudeDir, 'settings.json');
    fs.writeFileSync(target, '{}');
    fs.symlinkSync(target, link);

    const result = createSymlink(target, link);

    assert.equal(result.status, 'skipped');
  });

  it('backs up existing file before creating symlink', () => {
    const target = path.join(configDir, 'existing.md');
    const link = path.join(claudeDir, 'existing.md');
    fs.writeFileSync(target, '# New');
    fs.writeFileSync(link, '# Old content');

    const result = createSymlink(target, link);

    assert.equal(result.status, 'created');
    assert.equal(result.backedUp, true);
    assert.equal(fs.readlinkSync(link), target);
  });

  it('creates parent directories if needed', () => {
    const target = path.join(configDir, 'deep', 'nested.md');
    const link = path.join(claudeDir, 'deep', 'nested.md');
    fs.mkdirSync(path.join(configDir, 'deep'), { recursive: true });
    fs.writeFileSync(target, '# Deep');

    const result = createSymlink(target, link);

    assert.equal(result.status, 'created');
    assert.equal(fs.readlinkSync(link), target);
  });
});
