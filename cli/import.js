import fs from 'node:fs';
import path from 'node:path';

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

export function detectConfig(claudeDir) {
  const found = [];

  for (const item of IMPORTABLE_ITEMS) {
    const fullPath = path.join(claudeDir, item);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(fullPath).filter(f => !f.startsWith('.'));
      found.push({ name: item, type: 'directory', count: files.length });
    } else {
      found.push({ name: item, type: 'file', size: stat.size });
    }
  }

  const projectsDir = path.join(claudeDir, 'projects');
  if (fs.existsSync(projectsDir)) {
    let projectCount = 0;
    for (const slug of fs.readdirSync(projectsDir)) {
      const slugDir = path.join(projectsDir, slug);
      if (!fs.statSync(slugDir).isDirectory()) continue;
      const hasMemory = fs.existsSync(path.join(slugDir, 'memory'));
      const hasClaudeMd = fs.existsSync(path.join(slugDir, 'CLAUDE.md'));
      if (hasMemory || hasClaudeMd) projectCount++;
    }
    if (projectCount > 0) {
      found.push({ name: 'projects', type: 'directory', count: projectCount });
    }
  }

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

  return found;
}

export function importConfig(claudeDir, configDir, items) {
  for (const item of items) {
    const src = path.join(claudeDir, item);
    const dest = path.join(configDir, item);

    // Skip if source is a symlink pointing to dest (already synced)
    const srcStat = fs.lstatSync(src, { throwIfNoEntry: false });
    if (!srcStat) continue;
    if (srcStat.isSymbolicLink() && fs.readlinkSync(src) === dest) continue;

    // Remove existing destination (may be a symlink from a previous run)
    const destStat = fs.lstatSync(dest, { throwIfNoEntry: false });
    if (destStat) {
      fs.rmSync(dest, { recursive: true, force: true });
    }

    if (srcStat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true, dereference: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

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

export function importProjects(claudeDir, configDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  if (!fs.existsSync(projectsDir)) return [];

  const imported = [];

  for (const slug of fs.readdirSync(projectsDir)) {
    const slugDir = path.join(projectsDir, slug);
    if (!fs.statSync(slugDir).isDirectory()) continue;

    const memSrc = path.join(slugDir, 'memory');
    const mdSrc = path.join(slugDir, 'CLAUDE.md');

    if (fs.existsSync(memSrc)) {
      const dest = path.join(configDir, 'projects', slug, 'memory');
      const memStat = fs.lstatSync(memSrc, { throwIfNoEntry: false });
      // Skip if source is a symlink pointing to dest (already synced)
      if (memStat?.isSymbolicLink() && fs.readlinkSync(memSrc) === dest) continue;
      const destStat = fs.lstatSync(dest, { throwIfNoEntry: false });
      if (destStat) fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(memSrc, dest, { recursive: true, dereference: true });
      imported.push(`projects/${slug}/memory`);
    }

    if (fs.existsSync(mdSrc)) {
      const dest = path.join(configDir, 'projects', slug, 'CLAUDE.md');
      const mdStat = fs.lstatSync(mdSrc, { throwIfNoEntry: false });
      if (mdStat?.isSymbolicLink() && fs.readlinkSync(mdSrc) === dest) continue;
      const destStat = fs.lstatSync(dest, { throwIfNoEntry: false });
      if (destStat) fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(mdSrc, dest);
      imported.push(`projects/${slug}/CLAUDE.md`);
    }
  }

  return imported;
}
