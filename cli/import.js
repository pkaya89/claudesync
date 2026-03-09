import fs from 'node:fs';
import path from 'node:path';

export const IMPORTABLE_ITEMS = [
  'CLAUDE.md',
  'settings.json',
  'agents',
  'commands',
  'hooks',
  'skills',
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

  return found;
}

export function importConfig(claudeDir, configDir, items) {
  for (const item of items) {
    const src = path.join(claudeDir, item);
    const dest = path.join(configDir, item);

    if (!fs.existsSync(src)) continue;

    // Remove existing destination (may be a symlink from a previous run)
    if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) {
      fs.rmSync(dest, { recursive: true, force: true });
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
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
      if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(memSrc, dest, { recursive: true });
      imported.push(`projects/${slug}/memory`);
    }

    if (fs.existsSync(mdSrc)) {
      const dest = path.join(configDir, 'projects', slug, 'CLAUDE.md');
      if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(mdSrc, dest);
      imported.push(`projects/${slug}/CLAUDE.md`);
    }
  }

  return imported;
}
