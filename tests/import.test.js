import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectConfig, importConfig, IMPORTABLE_ITEMS } from '../cli/import.js';

describe('detectConfig', () => {
  let tmpDir;
  let claudeDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-import-'));
    claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects existing config files', () => {
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'test.md'), '# Agent');

    const found = detectConfig(claudeDir);

    assert.ok(found.some(f => f.name === 'CLAUDE.md'));
    assert.ok(found.some(f => f.name === 'settings.json'));
    assert.ok(found.some(f => f.name === 'agents'));
  });

  it('reports file count for directories', () => {
    const found = detectConfig(claudeDir);
    const agents = found.find(f => f.name === 'agents');
    assert.equal(agents.count, 1);
  });

  it('ignores excluded items like .credentials.json', () => {
    fs.writeFileSync(path.join(claudeDir, '.credentials.json'), '{}');
    const found = detectConfig(claudeDir);
    assert.ok(!found.some(f => f.name === '.credentials.json'));
  });
});

describe('importConfig', () => {
  let tmpDir;
  let claudeDir;
  let configDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-import2-'));
    claudeDir = path.join(tmpDir, '.claude');
    configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies files from claude dir to config dir', () => {
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# My instructions');

    importConfig(claudeDir, configDir, ['CLAUDE.md']);

    const content = fs.readFileSync(path.join(configDir, 'CLAUDE.md'), 'utf-8');
    assert.equal(content, '# My instructions');
  });

  it('copies directories recursively', () => {
    fs.mkdirSync(path.join(claudeDir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'commands', 'deploy.md'), '# Deploy');

    importConfig(claudeDir, configDir, ['commands']);

    assert.ok(fs.existsSync(path.join(configDir, 'commands', 'deploy.md')));
  });
});
