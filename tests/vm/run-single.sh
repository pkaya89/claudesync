#!/usr/bin/env bash
set -euo pipefail

# run-single.sh - Build and run tests in a single distro container.
# Usage: ./tests/vm/run-single.sh <distro>
# Example: ./tests/vm/run-single.sh ubuntu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DISTRO="${1:?Usage: run-single.sh <ubuntu|fedora|alpine>}"

DOCKERFILE="$SCRIPT_DIR/Dockerfile.$DISTRO"
if [ ! -f "$DOCKERFILE" ]; then
    echo "Error: No Dockerfile found for '$DISTRO' at $DOCKERFILE"
    exit 1
fi

IMAGE_NAME="claudesync-test-$DISTRO"

echo "Building $DISTRO image..."
docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" "$REPO_DIR"

echo ""
echo "Running tests on $DISTRO..."
docker run --rm "$IMAGE_NAME"
