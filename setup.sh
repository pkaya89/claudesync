#!/usr/bin/env bash
set -euo pipefail

# claudesync - Bash fallback for symlink setup.
# Safe to run multiple times. Backs up existing files before replacing.
# Compatible with Bash 3.2+ (macOS default).

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$REPO_DIR/config"
CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="$CLAUDE_DIR/.claudesync-backup-$(date +%Y%m%d-%H%M%S)"
backed_up=false

# Colours (if terminal supports them)
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    RED='\033[0;31m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    GREEN='' YELLOW='' RED='' BOLD='' RESET=''
fi

info()    { printf "${BOLD}%s${RESET}\n" "$1"; }
success() { printf "${GREEN}  ✓ %s${RESET}\n" "$1"; }
warn()    { printf "${YELLOW}  ! %s${RESET}\n" "$1"; }
error()   { printf "${RED}  ✗ %s${RESET}\n" "$1"; }

backup() {
    local src="$1"
    mkdir -p "$BACKUP_DIR"
    mv "$src" "$BACKUP_DIR/$(basename "$src")"
    backed_up=true
}

create_symlink() {
    local target="$1"
    local link="$2"
    local name
    name="$(basename "$link")"

    # Already correct?
    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        success "$name (already linked)"
        return
    fi

    # Ensure parent dir
    mkdir -p "$(dirname "$link")"

    # Back up existing
    if [ -e "$link" ] || [ -L "$link" ]; then
        backup "$link"
        warn "$name (backed up existing)"
    fi

    ln -s "$target" "$link"
    success "$name"
}

import_config() {
    info "Importing existing config from $CLAUDE_DIR..."
    mkdir -p "$CONFIG_DIR"

    local items=("CLAUDE.md" "settings.json" "agents" "commands" "hooks" "skills")
    for item in "${items[@]}"; do
        local src="$CLAUDE_DIR/$item"
        local dest="$CONFIG_DIR/$item"
        if [ -e "$src" ] && [ ! -L "$src" ]; then
            cp -r "$src" "$dest"
            success "Imported $item"
        fi
    done

    # Per-project memory and CLAUDE.md
    if [ -d "$CLAUDE_DIR/projects" ]; then
        for slug_dir in "$CLAUDE_DIR/projects"/*/; do
            [ -d "$slug_dir" ] || continue
            local slug
            slug="$(basename "$slug_dir")"

            if [ -d "$slug_dir/memory" ]; then
                mkdir -p "$CONFIG_DIR/projects/$slug"
                cp -r "$slug_dir/memory" "$CONFIG_DIR/projects/$slug/memory"
                success "Imported projects/$slug/memory"
            fi

            if [ -f "$slug_dir/CLAUDE.md" ]; then
                mkdir -p "$CONFIG_DIR/projects/$slug"
                cp "$slug_dir/CLAUDE.md" "$CONFIG_DIR/projects/$slug/CLAUDE.md"
                success "Imported projects/$slug/CLAUDE.md"
            fi
        done
    fi

    echo ""
}

# ─────────────────────────────────────────────

echo ""
info "claudesync"
echo "─────────────────────────────────────"
echo "  Repo:   $REPO_DIR"
echo "  Config: $CONFIG_DIR"
echo "  Claude: $CLAUDE_DIR"
echo ""

# Handle --import flag
if [ "${1:-}" = "--import" ]; then
    import_config
fi

# Check config dir has content
if [ ! -d "$CONFIG_DIR" ] || [ -z "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]; then
    warn "config/ is empty. Run with --import to import existing config first."
    warn "Or run: npx claudesync init"
    exit 0
fi

info "Creating symlinks..."

# Top-level items
for item in CLAUDE.md settings.json agents commands hooks skills; do
    target="$CONFIG_DIR/$item"
    link="$CLAUDE_DIR/$item"
    [ -e "$target" ] && create_symlink "$target" "$link"
done

# Per-project items
if [ -d "$CONFIG_DIR/projects" ]; then
    for slug_dir in "$CONFIG_DIR/projects"/*/; do
        [ -d "$slug_dir" ] || continue
        slug="$(basename "$slug_dir")"

        if [ -d "$slug_dir/memory" ]; then
            create_symlink "$slug_dir/memory" "$CLAUDE_DIR/projects/$slug/memory"
        fi

        if [ -f "$slug_dir/CLAUDE.md" ]; then
            create_symlink "$slug_dir/CLAUDE.md" "$CLAUDE_DIR/projects/$slug/CLAUDE.md"
        fi
    done
fi

echo ""
if $backed_up; then
    warn "Backups saved to: $BACKUP_DIR"
fi
success "Done!"
echo ""
