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
