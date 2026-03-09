import fs from 'node:fs';
import path from 'node:path';

// Top-level items to symlink (relative to ~/.claude and config/)
export const SYMLINK_ITEMS = [
  'CLAUDE.md',
  'settings.json',
  'agents',
  'commands',
  'hooks',
  'skills',
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
 * Create a single symlink. Backs up existing files.
 * Returns { status: 'created' | 'skipped', backedUp: boolean, backupPath?: string }
 */
export function createSymlink(target, link) {
  // Already correct?
  if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
    if (fs.readlinkSync(link) === target) {
      return { status: 'skipped', backedUp: false };
    }
    // Symlink exists but points to wrong target; fall through to backup & re-create
  }

  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(link), { recursive: true });

  let backedUp = false;
  let backupPath;

  // Back up existing file/dir/symlink
  const existing = fs.lstatSync(link, { throwIfNoEntry: false });
  if (existing) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${link}.backup-${timestamp}`;
    fs.renameSync(link, backupPath);
    backedUp = true;
  }

  fs.symlinkSync(target, link);
  return { status: 'created', backedUp, backupPath };
}

/**
 * Remove symlinks that point back to the config dir.
 * Returns array of { item, status: 'removed' | 'skipped', hasBackup: boolean }
 */
export function removeSymlinks(configDir, claudeDir) {
  const map = buildSymlinkMap(configDir, claudeDir);
  return map.map(({ target, link }) => {
    const name = path.relative(configDir, target);
    const stat = fs.lstatSync(link, { throwIfNoEntry: false });

    if (!stat?.isSymbolicLink() || fs.readlinkSync(link) !== target) {
      return { item: name, status: 'skipped', hasBackup: false };
    }

    fs.unlinkSync(link);

    const dir = path.dirname(link);
    const base = path.basename(link);
    const hasBackup = fs.readdirSync(dir).some(f => f.startsWith(`${base}.backup-`));

    return { item: name, status: 'removed', hasBackup };
  });
}

/**
 * Restore the most recent backup for each removed symlink.
 */
export function restoreBackups(configDir, claudeDir) {
  const map = buildSymlinkMap(configDir, claudeDir);
  const restored = [];

  for (const { target, link } of map) {
    const name = path.relative(configDir, target);
    const dir = path.dirname(link);
    const base = path.basename(link);
    const backups = fs.readdirSync(dir)
      .filter(f => f.startsWith(`${base}.backup-`))
      .sort()
      .reverse();

    if (backups.length > 0 && !fs.existsSync(link)) {
      fs.renameSync(path.join(dir, backups[0]), link);
      restored.push(name);
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
