import fs from 'node:fs';
import path from 'node:path';

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

/**
 * Build the full symlink map from config dir to claude dir.
 * Includes top-level items + per-project memory and CLAUDE.md.
 */
export function buildSymlinkMap(configDir, claudeDir) {
  const map = [];

  for (const item of SYMLINK_ITEMS) {
    const target = path.join(configDir, item);
    if (fs.existsSync(target)) {
      map.push({ target, link: path.join(claudeDir, item) });
    }
  }

  // Plugin config files (individual symlinks, not the whole plugins/ dir)
  for (const item of SYMLINK_PLUGIN_ITEMS) {
    const target = path.join(configDir, item);
    if (fs.existsSync(target)) {
      map.push({ target, link: path.join(claudeDir, item) });
    }
  }

  // Per-project files: config/projects/<slug>/memory and config/projects/<slug>/CLAUDE.md
  const projectsDir = path.join(configDir, 'projects');
  if (fs.existsSync(projectsDir)) {
    for (const slug of fs.readdirSync(projectsDir)) {
      const slugDir = path.join(projectsDir, slug);
      if (!fs.lstatSync(slugDir).isDirectory()) continue;

      const memoryDir = path.join(slugDir, 'memory');
      if (fs.existsSync(memoryDir)) {
        map.push({
          target: memoryDir,
          link: path.join(claudeDir, 'projects', slug, 'memory'),
        });
      }

      const claudeMd = path.join(slugDir, 'CLAUDE.md');
      if (fs.existsSync(claudeMd)) {
        map.push({
          target: claudeMd,
          link: path.join(claudeDir, 'projects', slug, 'CLAUDE.md'),
        });
      }
    }
  }

  return map;
}

/**
 * Create a single symlink. Backs up existing files to a central backup dir.
 * Returns { status: 'created' | 'skipped', backedUp: boolean, backupPath?: string }
 */
export function createSymlink(target, link, backupDir) {
  // Already correct?
  if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
    if (fs.readlinkSync(link) === target) {
      return { status: 'skipped', backedUp: false };
    }
    // Symlink exists but points to wrong target; fall through to backup & re-create
  }

  // Verify the target exists before replacing anything
  if (!fs.existsSync(target)) {
    return { status: 'skipped', backedUp: false };
  }

  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(link), { recursive: true });

  let backedUp = false;
  let backupPath;

  // Back up existing file/dir/symlink to central backup dir
  const existing = fs.lstatSync(link, { throwIfNoEntry: false });
  if (existing && !existing.isSymbolicLink()) {
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const claudeDir = path.dirname(link).includes('.claude')
      ? link.slice(0, link.indexOf('.claude') + '.claude'.length)
      : path.dirname(link);
    const relativeName = path.relative(claudeDir, link).replaceAll('/', '--');
    backupPath = path.join(backupDir, `${relativeName}.backup-${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.renameSync(link, backupPath);
    backedUp = true;
  } else if (existing) {
    // Remove existing symlink (no need to back up symlinks)
    fs.unlinkSync(link);
  }

  fs.symlinkSync(target, link);
  return { status: 'created', backedUp, backupPath };
}

/**
 * Remove symlinks that point back to the config dir.
 * Returns array of { item, status: 'removed' | 'skipped' }
 */
export function removeSymlinks(configDir, claudeDir) {
  const map = buildSymlinkMap(configDir, claudeDir);
  return map.map(({ target, link }) => {
    const name = path.relative(configDir, target);
    const stat = fs.lstatSync(link, { throwIfNoEntry: false });

    if (!stat?.isSymbolicLink() || fs.readlinkSync(link) !== target) {
      return { item: name, status: 'skipped' };
    }

    fs.unlinkSync(link);
    return { item: name, status: 'removed' };
  });
}

/**
 * Check if backups exist in the central backup dir.
 */
export function hasBackups(backupDir) {
  if (!fs.existsSync(backupDir)) return false;
  return fs.readdirSync(backupDir).some(f => f.includes('.backup-'));
}

/**
 * Restore backups from the central backup dir to ~/.claude.
 */
export function restoreBackups(backupDir, claudeDir) {
  if (!fs.existsSync(backupDir)) return [];

  const restored = [];
  const files = fs.readdirSync(backupDir).filter(f => f.includes('.backup-'));

  for (const file of files) {
    const flatName = file.replace(/\.backup-.*$/, '');
    const relativePath = flatName.replaceAll('--', path.sep);
    const dest = path.join(claudeDir, relativePath);

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(backupDir, file), dest);
      restored.push(relativePath);
    }
  }

  return restored;
}

/**
 * Verify all symlinks are correct.
 * Returns array of { item, status: 'ok' | 'missing' | 'wrong' | 'error' }
 */
export function verifySymlinks(configDir, claudeDir) {
  const map = buildSymlinkMap(configDir, claudeDir);
  return map.map(({ target, link }) => {
    const name = path.relative(configDir, target);
    try {
      const stat = fs.lstatSync(link);
      if (stat.isSymbolicLink() && fs.readlinkSync(link) === target) {
        return { item: name, status: 'ok' };
      }
      return { item: name, status: 'wrong' };
    } catch (err) {
      const status = err.code === 'ENOENT' ? 'missing' : 'error';
      return { item: name, status };
    }
  });
}
