# claudesync

Sync your Claude Code config across machines.

## Quick start

```bash
npx claudesync init
```

The interactive setup imports your existing `~/.claude` config, creates symlinks, and optionally initialises a git repo.

## What gets synced

| Item | Path |
|------|------|
| Global instructions | `CLAUDE.md` |
| Settings | `settings.json` |
| Custom agents | `agents/` |
| Slash commands | `commands/` |
| Hooks | `hooks/` |
| Skills | `skills/` |
| Project memory | `projects/*/memory/` |
| Project instructions | `projects/*/CLAUDE.md` |

Everything lives in the `config/` directory of your repo.

## What stays local

Credentials, session data, cache, and conversation history never leave your machine. Only the items listed above are synced.

## Second machine setup

```bash
git clone <your-repo-url> ~/claudesync
cd ~/claudesync
./setup.sh
```

## Day-to-day

```bash
git add -A && git commit -m "update config"
git push
```

On other machines, `git pull && ./setup.sh` picks up the changes.

## How it works

The `config/` directory in your repo is the single source of truth. During setup, each item inside `config/` is symlinked into `~/.claude`, so editing either location updates both. Existing files are backed up before being replaced.

## Bash fallback

If you prefer not to use Node, the included `setup.sh` handles symlink creation directly. Run `./setup.sh --import` on a fresh machine to import existing config before linking.

## Upstream updates

To pull in changes from the upstream template:

```bash
git remote add upstream https://github.com/<upstream>/claudesync.git
git pull upstream main
```

## Licence

MIT
