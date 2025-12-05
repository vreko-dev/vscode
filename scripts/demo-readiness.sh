#!/usr/bin/env bash

#
# Demo Readiness Validation Script
#
# Automated checks to ensure the extension is ready for YC demo.
# Runs comprehensive validation of all demo-critical functionality.
#
# Usage: ./scripts/demo-readiness.sh
#

set -e

echo "🎬 SnapBack Demo Readiness Validation"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

FAILURES=0
WARNINGS=0

# Function to check and report
check() {
    local name="$1"
    local command="$2"
    local is_warning="${3:-false}"

    echo -n "  Checking $name... "

    if eval "$command" > /dev/null 2>&1; then
        echo "${GREEN}✓${NC}"
        return 0
    else
        if [ "$is_warning" = "true" ]; then
            echo "${YELLOW}⚠${NC} Warning"
            ((WARNINGS++))
        else
            echo "${RED}✗${NC} Failed"
            ((FAILURES++))
        fi
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Build Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "Build directory exists" "[ -d 'out' ]"
check "Extension entry point exists" "[ -f 'out/extension.js' ]"
check "Package.json exists" "[ -f 'package.json' ]"
check "README.md exists" "[ -f 'README.md' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Package.json Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "Has name field" "grep -q '\"name\"' package.json"
check "Has version field" "grep -q '\"version\"' package.json"
check "Has publisher field" "grep -q '\"publisher\"' package.json"
check "Has engines field" "grep -q '\"engines\"' package.json"
check "Has main entry point" "grep -q '\"main\"' package.json"
check "Has activation events" "grep -q '\"activationEvents\"' package.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Demo-Critical Commands"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "snapback.initialize command" "grep -q 'snapback.initialize' package.json"
check "snapback.protectFile command" "grep -q 'snapback.protectFile' package.json"
check "snapback.setWatchLevel command" "grep -q 'snapback.setWatchLevel' package.json"
check "snapback.setWarnLevel command" "grep -q 'snapback.setWarnLevel' package.json"
check "snapback.setBlockLevel command" "grep -q 'snapback.setBlockLevel' package.json"
check "snapback.createSnapshot command" "grep -q 'snapback.createSnapshot' package.json"
check "snapback.snapBack command" "grep -q 'snapback.snapBack' package.json"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Test Infrastructure"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "Unit tests exist" "[ -d 'test/unit/demo-critical' ]"
check "Integration tests exist" "[ -d 'test/integration/demo-critical' ]"
check "E2E tests exist" "[ -d 'test/e2e/demo-critical' ]"
check "Test helpers exist" "[ -d 'test/helpers' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Scripts & Automation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "VSIX packaging script" "[ -f 'scripts/test-vsix-package.sh' ]"
check "Stability gate script" "[ -f 'scripts/stability-gate.sh' ]"
check "Demo readiness script" "[ -f 'scripts/demo-readiness.sh' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. Documentation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "Demo verification checklist" "[ -f 'DEMO_VERIFICATION_CHECKLIST.md' ]"
check "README has demo info" "grep -qi 'demo' README.md" true
check "CHANGELOG exists" "[ -f 'CHANGELOG.md' ]" true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. Dependencies"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check "node_modules exists" "[ -d 'node_modules' ]"
check "pnpm-lock.yaml exists" "[ -f 'pnpm-lock.yaml' ]"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8. Performance Budgets"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check VSIX size if it exists
if [ -f *.vsix ]; then
    VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n 1)
    VSIX_SIZE=$(stat -f%z "$VSIX_FILE" 2>/dev/null || stat -c%s "$VSIX_FILE" 2>/dev/null || echo "0")
    VSIX_SIZE_MB=$(echo "scale=2; $VSIX_SIZE / 1024 / 1024" | bc)

    echo -n "  VSIX size (<10MB)... "
    if (( $(echo "$VSIX_SIZE_MB < 10" | bc -l) )); then
        echo "${GREEN}✓${NC} ${VSIX_SIZE_MB}MB"
    else
        echo "${RED}✗${NC} ${VSIX_SIZE_MB}MB (exceeds budget)"
        ((FAILURES++))
    fi
else
    echo "  ${YELLOW}⚠${NC} No VSIX file found (run: pnpm exec vsce package)"
    ((WARNINGS++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9. Git Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if we're in a git repo
if [ -d .git ]; then
    # Check for uncommitted changes
    if git diff-index --quiet HEAD -- 2>/dev/null; then
        echo "  ${GREEN}✓${NC} No uncommitted changes"
    else
        echo "  ${YELLOW}⚠${NC} Uncommitted changes detected"
        ((WARNINGS++))
    fi

    # Check current branch
    BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    echo "  Current branch: $BRANCH"
else
    echo "  ${YELLOW}⚠${NC} Not a git repository"
    ((WARNINGS++))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Failures: $FAILURES"
echo "Warnings: $WARNINGS"
echo ""

if [ $FAILURES -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo "${GREEN}✓ DEMO READY${NC}"
        echo ""
        echo "All checks passed! Extension is ready for YC demo."
        echo ""
        echo "Next steps:"
        echo "  1. Run stability gate: ./scripts/stability-gate.sh"
        echo "  2. Complete manual verification: DEMO_VERIFICATION_CHECKLIST.md"
        echo "  3. Record demo video"
        echo ""
        exit 0
    else
        echo "${YELLOW}⚠ DEMO READY (with warnings)${NC}"
        echo ""
        echo "Core functionality ready, but some optional items need attention."
        echo "Review warnings above and address if necessary."
        echo ""
        exit 0
    fi
else
    echo "${RED}✗ NOT READY${NC}"
    echo ""
    echo "Critical issues found. Fix failures before proceeding with demo."
    echo ""
    exit 1
fi
