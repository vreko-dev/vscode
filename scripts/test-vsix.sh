#!/usr/bin/env bash

#
# VSIX Packaging Test Script
# Tests that the packaged .vsix extension actually works (not just dev mode)
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔧 VSIX Packaging Test"
echo "======================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_DIR="$(dirname "$SCRIPT_DIR")"
VSIX_FILE=""
TEST_WORKSPACE="$SCRIPT_DIR/../test-workspace-vsix"
FAILURES=0

# Cleanup function
cleanup() {
    echo ""
    echo "${BLUE}Cleaning up...${NC}"

    # Kill any running VS Code test instances
    pkill -f "vscode.*extensionTestsPath" || true

    # Remove test workspace
    rm -rf "$TEST_WORKSPACE" || true

    # Remove user data directory
    rm -rf "$VSCODE_DIR/.vscode-test-user-data" || true
}

trap cleanup EXIT

# Step 1: Clean previous builds
echo "${BLUE}Step 1/8: Cleaning previous builds${NC}"
cd "$VSCODE_DIR"
rm -rf out/ dist/ *.vsix || true
echo "${GREEN}✓${NC} Cleaned"
echo ""

# Step 2: Install dependencies
echo "${BLUE}Step 2/8: Installing dependencies${NC}"
if ! pnpm install --frozen-lockfile; then
    echo "${RED}✗${NC} Failed to install dependencies"
    exit 1
fi
echo "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Build extension
echo "${BLUE}Step 3/8: Building extension${NC}"
if ! pnpm run build; then
    echo "${RED}✗${NC} Build failed"
    exit 1
fi

# Verify build output
if [ ! -d "out" ] || [ ! -f "out/extension.js" ]; then
    echo "${RED}✗${NC} Build output missing"
    exit 1
fi
echo "${GREEN}✓${NC} Built successfully"
echo ""

# Step 4: Package extension
echo "${BLUE}Step 4/8: Packaging extension as VSIX${NC}"
if ! pnpm exec vsce package --no-dependencies; then
    echo "${RED}✗${NC} Packaging failed"
    exit 1
fi

# Find the generated VSIX file
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "${RED}✗${NC} No VSIX file generated"
    exit 1
fi

VSIX_SIZE=$(stat -f%z "$VSIX_FILE" 2>/dev/null || stat -c%s "$VSIX_FILE")
VSIX_SIZE_MB=$(echo "scale=2; $VSIX_SIZE / 1024 / 1024" | bc)

# Check VSIX size budget (<10MB)
if (( $(echo "$VSIX_SIZE_MB > 10" | bc -l) )); then
    echo "${RED}✗${NC} VSIX too large: ${VSIX_SIZE_MB}MB (budget: <10MB)"
    ((FAILURES++))
else
    echo "${GREEN}✓${NC} Packaged: $VSIX_FILE (${VSIX_SIZE_MB}MB)"
fi
echo ""

# Step 5: Validate VSIX contents
echo "${BLUE}Step 5/8: Validating VSIX contents${NC}"
TEMP_DIR=$(mktemp -d)
unzip -q "$VSIX_FILE" -d "$TEMP_DIR"

CRITICAL_FILES=(
    "extension/out/extension.js"
    "extension/package.json"
    "extension/README.md"
    "extension/CHANGELOG.md"
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
    ((FAILURES++))
else
    echo "${GREEN}✓${NC} All critical files present"
fi

rm -rf "$TEMP_DIR"
echo ""

# Step 6: Validate package.json in VSIX
echo "${BLUE}Step 6/8: Validating package.json${NC}"
TEMP_DIR=$(mktemp -d)
unzip -q "$VSIX_FILE" -d "$TEMP_DIR"
PACKAGE_JSON="$TEMP_DIR/extension/package.json"

REQUIRED_FIELDS=("name" "version" "publisher" "engines" "activationEvents" "main" "contributes")
MISSING_FIELDS=()

for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" "$PACKAGE_JSON"; then
        MISSING_FIELDS+=("$field")
    fi
done

if [ ${#MISSING_FIELDS[@]} -gt 0 ]; then
    echo "${RED}✗${NC} Missing required fields: ${MISSING_FIELDS[*]}"
    ((FAILURES++))
else
    echo "${GREEN}✓${NC} package.json valid"
fi

# Validate demo-critical commands
REQUIRED_COMMANDS=("snapback.initialize" "snapback.protectFile" "snapback.setWatchLevel" "snapback.setWarnLevel" "snapback.setBlockLevel" "snapback.createSnapshot" "snapback.snapBack")
MISSING_COMMANDS=()

for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! grep -q "\"$cmd\"" "$PACKAGE_JSON"; then
        MISSING_COMMANDS+=("$cmd")
    fi
done

if [ ${#MISSING_COMMANDS[@]} -gt 0 ]; then
    echo "${RED}✗${NC} Missing demo-critical commands: ${MISSING_COMMANDS[*]}"
    ((FAILURES++))
else
    echo "${GREEN}✓${NC} All demo-critical commands present"
fi

rm -rf "$TEMP_DIR"
echo ""

# Step 7: Install VSIX and run packaged tests
echo "${BLUE}Step 7/8: Installing VSIX and running packaged tests${NC}"

# Create test workspace
mkdir -p "$TEST_WORKSPACE"
cat > "$TEST_WORKSPACE/package.json" <<EOF
{
  "name": "test-workspace",
  "version": "1.0.0"
}
EOF

# Create test config for packaged extension
cat > "$VSCODE_DIR/.vscode-test-packaged.mjs" <<EOF
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/e2e/packaged/**/*.test.js',
  version: '1.96.0',
  workspaceFolder: '$TEST_WORKSPACE',
  extensionDevelopmentPath: undefined,
  extensionTestsPath: './out/test/e2e/packaged/index.js',
  launchArgs: [
    '--install-extension=$VSCODE_DIR/$VSIX_FILE',
    '--disable-extensions',
    '--disable-updates',
    '--disable-gpu',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--user-data-dir=$VSCODE_DIR/.vscode-test-user-data'
  ],
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true
  }
});
EOF

# Run packaged tests (if they exist)
if [ -f "out/test/e2e/packaged/index.js" ]; then
    if pnpm vscode-test --config .vscode-test-packaged.mjs; then
        echo "${GREEN}✓${NC} Packaged tests passed"
    else
        echo "${RED}✗${NC} Packaged tests failed"
        ((FAILURES++))
    fi
else
    echo "${YELLOW}⚠${NC} No packaged tests found (create test/e2e/packaged/)"
fi
echo ""

# Step 8: Performance budget validation
echo "${BLUE}Step 8/8: Validating performance budgets${NC}"

if (( $(echo "$VSIX_SIZE_MB > 10" | bc -l) )); then
    echo "${RED}✗${NC} VSIX size exceeds budget"
    ((FAILURES++))
else
    echo "${GREEN}✓${NC} VSIX size within budget: ${VSIX_SIZE_MB}MB < 10MB"
fi
echo ""

# Summary
echo "======================================"
echo "Summary"
echo "======================================"
echo ""
echo "VSIX File: $VSIX_FILE"
echo "Size: ${VSIX_SIZE_MB}MB"
echo "Failures: $FAILURES"
echo ""

if [ $FAILURES -eq 0 ]; then
    echo "${GREEN}✓ VSIX PACKAGING TEST PASSED${NC}"
    echo ""
    echo "The packaged extension is ready for demo!"
    exit 0
else
    echo "${RED}✗ VSIX PACKAGING TEST FAILED${NC}"
    echo ""
    echo "Fix $FAILURES issue(s) before demo."
    exit 1
fi
