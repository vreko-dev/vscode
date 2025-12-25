#!/usr/bin/env bash

#
# Unified Demo Orchestration Script
#
# Runs all demo preparation steps in sequence:
# 1. demo-readiness.sh - Static validation checks
# 2. pre-demo.sh - Triple-run stability gate (optional, skip with --quick)
# 3. launch-demo-vscode.sh - Launch demo environment
#
# Usage:
#   ./scripts/demo.sh           # Full validation + launch
#   ./scripts/demo.sh --quick   # Skip stability tests, just validate + launch
#   ./scripts/demo.sh --check   # Only run checks, don't launch
#   ./scripts/demo.sh --launch  # Only launch (skip all checks)
#

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
QUICK_MODE=false
CHECK_ONLY=false
LAUNCH_ONLY=false

for arg in "$@"; do
    case $arg in
        --quick)
            QUICK_MODE=true
            ;;
        --check)
            CHECK_ONLY=true
            ;;
        --launch)
            LAUNCH_ONLY=true
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --quick   Skip stability tests (faster)"
            echo "  --check   Only run checks, don't launch VS Code"
            echo "  --launch  Only launch VS Code (skip all checks)"
            echo "  --help    Show this help message"
            exit 0
            ;;
    esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║           🎬 SnapBack Demo Orchestrator                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Demo Readiness (static checks)
if [ "$LAUNCH_ONLY" = false ]; then
    echo "${BLUE}━━━ Step 1/3: Demo Readiness Checks ━━━${NC}"
    echo ""

    if "$SCRIPT_DIR/demo-readiness.sh"; then
        echo ""
        echo "${GREEN}✓ Readiness checks passed${NC}"
    else
        echo ""
        echo "${RED}✗ Readiness checks failed${NC}"
        echo "Fix the issues above before proceeding."
        exit 1
    fi
    echo ""
fi

# Step 2: Stability Gate (triple-run tests)
if [ "$LAUNCH_ONLY" = false ] && [ "$QUICK_MODE" = false ]; then
    echo "${BLUE}━━━ Step 2/3: Stability Gate (triple-run) ━━━${NC}"
    echo ""
    echo "${YELLOW}Note: This runs all tests 3 times to detect flakiness.${NC}"
    echo "${YELLOW}Use --quick to skip this step.${NC}"
    echo ""

    if "$SCRIPT_DIR/pre-demo.sh"; then
        echo ""
        echo "${GREEN}✓ Stability gate passed${NC}"
    else
        echo ""
        echo "${RED}✗ Stability gate failed${NC}"
        echo "Tests are failing or flaky. Fix before demo."
        exit 1
    fi
    echo ""
elif [ "$QUICK_MODE" = true ]; then
    echo "${YELLOW}━━━ Step 2/3: Stability Gate (SKIPPED - quick mode) ━━━${NC}"
    echo ""
fi

# Step 3: Launch Demo Environment
if [ "$CHECK_ONLY" = false ]; then
    echo "${BLUE}━━━ Step 3/3: Launching Demo Environment ━━━${NC}"
    echo ""

    "$SCRIPT_DIR/launch-demo-vscode.sh"
else
    echo "${YELLOW}━━━ Step 3/3: Launch (SKIPPED - check only mode) ━━━${NC}"
    echo ""
    echo "${GREEN}✓ All checks passed. Ready for demo!${NC}"
    echo ""
    echo "To launch the demo environment, run:"
    echo "  $SCRIPT_DIR/launch-demo-vscode.sh"
fi
