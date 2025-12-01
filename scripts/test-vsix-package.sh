#!/usr/bin/env bash

#
# Demo-Critical VSIX Packaging Test Script
#
# This script validates that the VS Code extension packages correctly
# and contains all required files. Prevents "works in dev, breaks in package" issues.
#
# Usage: ./scripts/test-vsix-package.sh
#

set -e  # Exit on error

echo "🧢 SnapBack VSIX Packaging Test"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Performance tracking
SCRIPT_START=$(date +%s)

# Step 1: Clean previous builds
echo "📦 Step 1/7: Cleaning previous builds..."
rm -rf out/ dist/ *.vsix || true
echo "${GREEN}✓${NC} Cleaned"
echo ""

# Step 2: Install dependencies
echo "📦 Step 2/7: Installing dependencies..."
INSTALL_START=$(date +%s)
pnpm install --frozen-lockfile
INSTALL_END=$(date +%s)
INSTALL_TIME=$((INSTALL_END - INSTALL_START))
echo "${GREEN}✓${NC} Dependencies installed (${INSTALL_TIME}s)"
echo ""

# Step 3: Build extension
echo "📦 Step 3/7: Building extension..."
BUILD_START=$(date +%s)
pnpm run build
BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

# Verify build output exists
if [ ! -d "out" ]; then
    echo "${RED}✗${NC} Build failed: out/ directory not found"
    exit 1
fi

echo "${GREEN}✓${NC} Built successfully (${BUILD_TIME}s)"
echo ""

# Step 4: Package extension
echo "📦 Step 4/7: Packaging extension..."
PACKAGE_START=$(date +%s)

# Use vsce to package
pnpm exec vsce package --no-dependencies

# Find the generated VSIX file
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "${RED}✗${NC} Packaging failed: No VSIX file generated"
    exit 1
fi

PACKAGE_END=$(date +%s)
PACKAGE_TIME=$((PACKAGE_END - PACKAGE_START))

echo "${GREEN}✓${NC} Packaged: ${VSIX_FILE} (${PACKAGE_TIME}s)"
echo ""

# Step 5: Validate VSIX contents
echo "📦 Step 5/7: Validating VSIX contents..."

# Extract VSIX (it's a ZIP file)
TEMP_DIR=$(mktemp -d)
unzip -q "$VSIX_FILE" -d "$TEMP_DIR"

# Critical files that must be present
CRITICAL_FILES=(
    "extension/out/extension.js"
    "extension/package.json"
    "extension/README.md"
)

MISSING_FILES=()

for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$TEMP_DIR/$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo "${RED}✗${NC} Missing critical files:"
    for file in "${MISSING_FILES[@]}"; do
        echo "  - $file"
    done
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "${GREEN}✓${NC} All critical files present"
echo ""

# Step 6: Validate package.json
echo "📦 Step 6/7: Validating package.json..."

PACKAGE_JSON="$TEMP_DIR/extension/package.json"

# Check required fields
REQUIRED_FIELDS=("name" "version" "publisher" "engines" "activationEvents" "main" "contributes")
MISSING_FIELDS=()

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" "$PACKAGE_JSON"; then
        MISSING_FIELDS+=("$field")
    fi
done

if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
    echo "${RED}✗${NC} Missing required package.json fields:"
    for field in "${MISSING_FIELDS[@]}"; do
        echo "  - $field"
    done
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Validate activation events
if ! grep -q "onStartupFinished" "$PACKAGE_JSON"; then
    echo "${YELLOW}⚠${NC}  Warning: No onStartupFinished activation event"
fi

# Validate commands are registered
REQUIRED_COMMANDS=("snapback.initialize" "snapback.protectFile" "snapback.createSnapshot" "snapback.snapBack")
MISSING_COMMANDS=()

for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! grep -q "\"$cmd\"" "$PACKAGE_JSON"; then
        MISSING_COMMANDS+=("$cmd")
    fi
done

if [ ${#MISSING_COMMANDS[@]} -gt 0 ]; then
    echo "${RED}✗${NC} Missing demo-critical commands:"
    for cmd in "${MISSING_COMMANDS[@]}"; do
        echo "  - $cmd"
    done
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "${GREEN}✓${NC} package.json valid"
echo ""

# Step 7: Performance budget check
echo "📦 Step 7/7: Checking performance budgets..."

# VSIX file size (should be reasonable, <10MB)
VSIX_SIZE=$(stat -f%z "$VSIX_FILE" 2>/dev/null || stat -c%s "$VSIX_FILE")
VSIX_SIZE_MB=$(echo "scale=2; $VSIX_SIZE / 1024 / 1024" | bc)

if (( $(echo "$VSIX_SIZE_MB > 10" | bc -l) )); then
    echo "${RED}✗${NC} VSIX too large: ${VSIX_SIZE_MB}MB (budget: <10MB)"
    rm -rf "$TEMP_DIR"
    exit 1
fi

echo "${GREEN}✓${NC} VSIX size: ${VSIX_SIZE_MB}MB (budget: <10MB)"

# Total time
SCRIPT_END=$(date +%s)
TOTAL_TIME=$((SCRIPT_END - SCRIPT_START))

echo ""
echo "================================"
echo "${GREEN}✓ All validation checks passed!${NC}"
echo ""
echo "Summary:"
echo "  - Install time:  ${INSTALL_TIME}s"
echo "  - Build time:    ${BUILD_TIME}s"
echo "  - Package time:  ${PACKAGE_TIME}s"
echo "  - Total time:    ${TOTAL_TIME}s"
echo "  - VSIX size:     ${VSIX_SIZE_MB}MB"
echo "  - VSIX file:     ${VSIX_FILE}"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

# Performance budget: Total should be <120s
if [ $TOTAL_TIME -gt 120 ]; then
    echo "${YELLOW}⚠${NC}  Warning: Total time ${TOTAL_TIME}s exceeds budget of 120s"
    exit 1
fi

echo "${GREEN}✓ Performance budget met: ${TOTAL_TIME}s < 120s${NC}"
exit 0
