#!/usr/bin/env node

import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { detectConfig, importConfig, importProjects } from './import.js';
import { buildSymlinkMap, createSymlink, verifySymlinks } from './link.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

async function main() {
  p.intro('claudesync');

  const command = process.argv[2];

  if (!command || command === 'init') {
    await init();
  } else if (command === 'status') {
    await status();
  } else {
    p.log.error(`Unknown command: ${command}`);
    p.log.info('Usage: claudesync init | claudesync status');
    process.exit(1);
  }
}

async function init() {
  // 1. Ask where to store the repo
  const repoPath = await p.text({
    message: 'Where should we store your config repo?',
    placeholder: path.join(os.homedir(), 'claudesync'),
    defaultValue: path.join(os.homedir(), 'claudesync'),
    validate: (value) => {
      if (!value) return 'Path is required';
    },
  });

  if (p.isCancel(repoPath)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  const resolvedPath = repoPath.replace(/^~/, os.homedir());
  const configDir = path.join(resolvedPath, 'config');

  // 2. Detect existing config
  if (fs.existsSync(CLAUDE_DIR)) {
    const found = detectConfig(CLAUDE_DIR);

    if (found.length > 0) {
      p.log.info('Found existing Claude Code config:');
      for (const item of found) {
        if (item.type === 'directory') {
          p.log.message(`  ${item.name}/ (${item.count} ${item.count === 1 ? 'item' : 'items'})`);
        } else {
          p.log.message(`  ${item.name} (${formatSize(item.size)})`);
        }
      }

      const importChoice = await p.select({
        message: 'Import into your new repo?',
        options: [
          { value: 'all', label: 'Yes, import everything' },
          { value: 'choose', label: 'Let me choose what to import' },
          { value: 'none', label: 'No, start fresh' },
        ],
      });

      if (p.isCancel(importChoice)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      if (importChoice === 'all') {
        const s = p.spinner();
        s.start('Importing config');
        fs.mkdirSync(configDir, { recursive: true });
        const topLevel = found.filter(f => f.name !== 'projects').map(f => f.name);
        importConfig(CLAUDE_DIR, configDir, topLevel);
        if (found.some(f => f.name === 'projects')) {
          importProjects(CLAUDE_DIR, configDir);
        }
        s.stop('Config imported');
      } else if (importChoice === 'choose') {
        const selected = await p.multiselect({
          message: 'Select items to import:',
          options: found.map(item => ({
            value: item.name,
            label: item.type === 'directory'
              ? `${item.name}/ (${item.count} ${item.count === 1 ? 'item' : 'items'})`
              : `${item.name} (${formatSize(item.size)})`,
          })),
        });

        if (p.isCancel(selected)) {
          p.cancel('Setup cancelled.');
          process.exit(0);
        }

        const s = p.spinner();
        s.start('Importing selected config');
        fs.mkdirSync(configDir, { recursive: true });
        const topLevel = selected.filter(n => n !== 'projects');
        importConfig(CLAUDE_DIR, configDir, topLevel);
        if (selected.includes('projects')) {
          importProjects(CLAUDE_DIR, configDir);
        }
        s.stop('Config imported');
      } else {
        fs.mkdirSync(configDir, { recursive: true });
      }
    } else {
      p.log.warn('No importable config found in ~/.claude');
      fs.mkdirSync(configDir, { recursive: true });
    }
  } else {
    p.log.warn('No ~/.claude directory found. Starting fresh.');
    fs.mkdirSync(configDir, { recursive: true });
  }

  // 3. Create symlinks
  const s = p.spinner();
  s.start('Creating symlinks');
  const symlinkMap = buildSymlinkMap(configDir, CLAUDE_DIR);
  const results = [];
  for (const { target, link } of symlinkMap) {
    const result = createSymlink(target, link);
    results.push({ ...result, name: path.relative(configDir, target) });
  }
  s.stop('Symlinks created');

  for (const r of results) {
    if (r.status === 'created' && r.backedUp) {
      p.log.warn(`  ${r.name} (backed up existing)`);
    } else if (r.status === 'created') {
      p.log.success(`  ${r.name}`);
    } else {
      p.log.info(`  ${r.name} (already linked)`);
    }
  }

  // 4. Git init
  const shouldGitInit = await p.confirm({
    message: 'Initialise git repo and create first commit?',
    initialValue: true,
  });

  if (!p.isCancel(shouldGitInit) && shouldGitInit) {
    execSync('git init', { cwd: resolvedPath, stdio: 'ignore' });
    execSync('git add -A', { cwd: resolvedPath, stdio: 'ignore' });
    execSync('git commit -m "Initial claudesync config"', { cwd: resolvedPath, stdio: 'ignore' });
    p.log.success('Git repo initialised with first commit');
  }

  p.note(
    `cd ${resolvedPath}\ngit remote add origin <your-repo-url>\ngit push -u origin main`,
    'Next steps'
  );

  p.outro('Your Claude Code config is now version-controlled.');
}

async function status() {
  const configDir = path.join(process.cwd(), 'config');
  if (!fs.existsSync(configDir)) {
    p.log.error('No config/ directory found. Are you in a claudesync repo?');
    process.exit(1);
  }

  const results = verifySymlinks(configDir, CLAUDE_DIR);

  for (const r of results) {
    if (r.status === 'ok') {
      p.log.success(`${r.item}`);
    } else if (r.status === 'missing') {
      p.log.warn(`${r.item} (not linked)`);
    } else {
      p.log.error(`${r.item} (wrong target)`);
    }
  }

  p.outro('');
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

main().catch((err) => {
  p.log.error(err.message);
  process.exit(1);
});
