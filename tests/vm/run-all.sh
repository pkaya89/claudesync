#!/usr/bin/env bash
set -uo pipefail

# run-all.sh - Build and run tests across all distros.
# Usage: ./tests/vm/run-all.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

DISTROS=("ubuntu" "fedora" "alpine")
PASS=0
FAIL=0
RESULTS=()

for distro in "${DISTROS[@]}"; do
    echo "=============================="
    echo "  Testing on: $distro"
    echo "=============================="

    IMAGE_NAME="claudesync-test-$distro"
    DOCKERFILE="$SCRIPT_DIR/Dockerfile.$distro"

    if ! docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" "$REPO_DIR" > /dev/null 2>&1; then
        echo "  BUILD FAILED"
        RESULTS+=("$distro: BUILD FAILED")
        FAIL=$((FAIL + 1))
        continue
    fi

    if docker run --rm "$IMAGE_NAME" 2>&1; then
        RESULTS+=("$distro: PASS")
        PASS=$((PASS + 1))
    else
        RESULTS+=("$distro: FAIL")
        FAIL=$((FAIL + 1))
    fi

    echo ""
done

echo "=============================="
echo "  Summary"
echo "=============================="
for result in "${RESULTS[@]}"; do
    echo "  $result"
done
echo ""
echo "  Passed: $PASS / $((PASS + FAIL))"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
