# Manual Test Plan - claudesync

Run these scenarios to verify claudesync works end-to-end. Each scenario is independent - reset between them by running the cleanup steps.

## Prerequisites

```bash
cd ~/Documents/Github/claudesync
npm link   # makes 'claudesync' command available globally
```

## Cleanup between tests

```bash
# Remove any test repo
rm -rf /tmp/claudesync-manual-test

# Remove symlinks from ~/.claude (only if they point to test locations)
# Check first:
ls -la ~/.claude/CLAUDE.md ~/.claude/settings.json 2>/dev/null
```

---

## Scenario 1: Fresh init with "import everything"

**Purpose:** Verify the happy path - detect config, import all, create symlinks.

1. Run `claudesync` (or `npx claudesync init`)
2. Select path: choose "Choose a different path" and enter `/tmp/claudesync-manual-test`
3. It should list your existing ~/.claude config items
4. **Check:** Are all expected items shown? (CLAUDE.md, settings.json, keybindings.json, agents/, commands/, skills/, rules/, plugins config, projects/)
5. Select "Yes, import everything"
6. **Check:** Spinner shows "Importing config" then "Config imported"
7. **Check:** Spinner shows "Creating symlinks" then "Symlinks created"
8. **Check:** Each symlink is listed with a tick or "already linked"
9. Verify the config was copied:
   ```bash
   ls -la /tmp/claudesync-manual-test/config/
   ls -la /tmp/claudesync-manual-test/config/plugins/
   ls -la /tmp/claudesync-manual-test/config/projects/
   ```
10. Verify symlinks point correctly:
    ```bash
    ls -la ~/.claude/CLAUDE.md
    ls -la ~/.claude/settings.json
    ls -la ~/.claude/keybindings.json
    ls -la ~/.claude/rules/
    ls -la ~/.claude/plugins/installed_plugins.json 2>/dev/null
    ```
11. Verify content is accessible through symlinks:
    ```bash
    cat ~/.claude/CLAUDE.md
    # Should match: cat /tmp/claudesync-manual-test/config/CLAUDE.md
    ```

**Pass criteria:** All config imported, all symlinks created and pointing to config/.

---

## Scenario 2: Fresh init with "let me choose"

**Purpose:** Verify selective import works.

1. Clean up from previous test
2. Run `claudesync`
3. Choose path `/tmp/claudesync-manual-test`
4. Select "Let me choose what to import"
5. **Check:** All items shown with toggle interface
6. Select only CLAUDE.md and settings.json (deselect everything else)
7. Confirm
8. **Check:** Only selected items appear in config/:
   ```bash
   ls /tmp/claudesync-manual-test/config/
   # Should only show CLAUDE.md and settings.json
   ```
9. **Check:** Symlinks only created for those two items

**Pass criteria:** Only selected items imported and symlinked.

---

## Scenario 3: Fresh init with "start fresh"

**Purpose:** Verify starting without importing existing config.

1. Clean up from previous test
2. Run `claudesync`
3. Choose path `/tmp/claudesync-manual-test`
4. Select "No, start fresh"
5. **Check:** config/ directory is created but empty
6. **Check:** No symlinks created (nothing to link to)
7. **Check:** "Next steps" note is shown

**Pass criteria:** Empty config dir, no symlinks, no errors.

---

## Scenario 4: Status check

**Purpose:** Verify status command reports correctly.

1. First run Scenario 1 to set up symlinks
2. From the repo directory:
   ```bash
   cd /tmp/claudesync-manual-test
   claudesync status
   ```
3. **Check:** Each synced item shows with a tick (ok)
4. Now break a symlink manually:
   ```bash
   rm ~/.claude/CLAUDE.md
   echo "# broken" > ~/.claude/CLAUDE.md
   ```
5. Run `claudesync status` again
6. **Check:** CLAUDE.md shows as "wrong target" or "not linked"
7. Restore it:
   ```bash
   rm ~/.claude/CLAUDE.md
   ln -s /tmp/claudesync-manual-test/config/CLAUDE.md ~/.claude/CLAUDE.md
   ```

**Pass criteria:** Status correctly reports ok, missing, and wrong states.

---

## Scenario 5: Uninstall with backup restore

**Purpose:** Verify uninstall removes symlinks and offers to restore backups.

1. First run Scenario 1 (this creates backups of your original files)
2. From the repo directory:
   ```bash
   cd /tmp/claudesync-manual-test
   claudesync uninstall
   ```
3. **Check:** Confirmation prompt appears
4. Confirm yes
5. **Check:** Each symlink shows as "removed"
6. **Check:** If backups exist, it asks whether to restore them
7. Choose yes to restore
8. **Check:** Original files are back in ~/.claude/:
   ```bash
   ls -la ~/.claude/CLAUDE.md
   # Should be a regular file, not a symlink
   ```

**Pass criteria:** Symlinks removed, backups restored, config/ untouched.

---

## Scenario 6: Uninstall without backups (copy back)

**Purpose:** Verify uninstall copies config back when no backups exist.

1. Run Scenario 1, then delete the backups dir:
   ```bash
   rm -rf /tmp/claudesync-manual-test/backups
   ```
2. Run `claudesync uninstall`
3. Confirm yes
4. **Check:** It asks "Copy your config files back to ~/.claude?"
5. Choose yes
6. **Check:** Files are copied back as regular files (not symlinks):
   ```bash
   ls -la ~/.claude/CLAUDE.md
   file ~/.claude/CLAUDE.md
   ```

**Pass criteria:** Config copied back as real files, no data loss.

---

## Scenario 7: Idempotency - run init twice

**Purpose:** Verify running init again doesn't break existing setup.

1. Run Scenario 1
2. Run `claudesync` again with the same path
3. **Check:** It should detect config, import, and create symlinks without errors
4. **Check:** Symlinks show as "already linked"
5. Run `claudesync status`:
   ```bash
   cd /tmp/claudesync-manual-test
   claudesync status
   ```
6. **Check:** Everything shows as ok

**Pass criteria:** No errors, no duplicate files, all symlinks correct.

---

## Scenario 8: New items (keybindings, rules, plugins)

**Purpose:** Specifically verify the new items added in this release work.

1. Make sure these exist in your ~/.claude before testing:
   ```bash
   # Check what you have:
   ls ~/.claude/keybindings.json 2>/dev/null
   ls -d ~/.claude/rules/ 2>/dev/null
   ls ~/.claude/plugins/*.json 2>/dev/null
   ```
2. If any are missing, create test ones:
   ```bash
   echo '{}' > ~/.claude/keybindings.json
   mkdir -p ~/.claude/rules && echo '- Use British English' > ~/.claude/rules/style.md
   ```
3. Run `claudesync` and import everything
4. **Check:** New items appear in the detection list
5. **Check:** They are imported to config/:
   ```bash
   ls /tmp/claudesync-manual-test/config/keybindings.json
   ls /tmp/claudesync-manual-test/config/rules/
   ls /tmp/claudesync-manual-test/config/plugins/ 2>/dev/null
   ```
6. **Check:** Symlinks are created:
   ```bash
   ls -la ~/.claude/keybindings.json
   ls -la ~/.claude/rules
   ```

**Pass criteria:** keybindings.json, rules/, and plugin config files all sync correctly.

---

## Scenario 9: Bash fallback (setup.sh)

**Purpose:** Verify the bash script works independently of Node.

1. Clean up from previous tests
2. Set up a config dir manually:
   ```bash
   mkdir -p /tmp/claudesync-bash-test/config
   echo '# Test' > /tmp/claudesync-bash-test/config/CLAUDE.md
   echo '{}' > /tmp/claudesync-bash-test/config/settings.json
   ```
3. Run:
   ```bash
   cd /tmp/claudesync-bash-test
   cp ~/Documents/Github/claudesync/setup.sh .
   bash setup.sh
   ```
4. **Check:** Symlinks created for CLAUDE.md and settings.json
5. Run with --import flag from a fresh state:
   ```bash
   rm -rf /tmp/claudesync-bash-test/config
   bash setup.sh --import
   ```
6. **Check:** Config imported from ~/.claude, then symlinks created

**Pass criteria:** Bash script works without Node, imports and symlinks correctly.

---

## Scenario 10: Cancel at each prompt

**Purpose:** Verify Ctrl+C / Esc exits gracefully at every stage.

1. Run `claudesync` and press Ctrl+C at the path selection
2. **Check:** Shows "Setup cancelled." and exits cleanly
3. Run again, choose a path, then Ctrl+C at the import choice
4. **Check:** Clean exit, no partial state left behind
5. Run again, choose a path, choose "Let me choose", then Ctrl+C at the multiselect
6. **Check:** Clean exit

**Pass criteria:** No crashes, no partial files left behind, clean exit messages.

---

## Things to watch for

- **Data loss:** Does any original file in ~/.claude get deleted without a backup?
- **Broken Claude Code:** After setting up symlinks, does Claude Code still work normally?
- **Permissions:** Are file permissions preserved after import?
- **Large files:** If you have large project memory dirs, does import handle them?
- **Spaces in paths:** If your username or paths contain spaces, does everything still work?
