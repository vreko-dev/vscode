#!/usr/bin/env bash

#
# Demo Environment Launch Script
#
# Launches VS Code with:
# - Isolated user-data directory (frozen demo environment)
# - Packaged VSIX extension installed
# - All updates disabled
# - No workspace trust prompts
# - Prepared demo workspace
#
# Usage: ./scripts/launch-demo-vscode.sh
#

set -euo pipefail

echo "🎬 Launching SnapBack Demo Environment"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_DIR="$(dirname "$SCRIPT_DIR")"
DEMO_USER_DATA="$VSCODE_DIR/.vscode-demo-user-data"
DEMO_WORKSPACE="$VSCODE_DIR/demo-workspace"
VSIX_FILE=""

# Step 1: Find packaged VSIX
echo "${BLUE}Step 1/6: Locating VSIX package${NC}"
cd "$VSCODE_DIR"

VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "${RED}✗${NC} No VSIX file found"
    echo ""
    echo "Please run: pnpm exec vsce package"
    exit 1
fi

VSIX_ABSOLUTE="$VSCODE_DIR/$VSIX_FILE"
echo "${GREEN}✓${NC} Found: $VSIX_FILE"
echo ""

# Step 2: Clean previous demo environment
echo "${BLUE}Step 2/6: Cleaning previous demo environment${NC}"
if [ -d "$DEMO_USER_DATA" ]; then
    echo "  Removing old user-data..."
    rm -rf "$DEMO_USER_DATA"
fi
mkdir -p "$DEMO_USER_DATA"
echo "${GREEN}✓${NC} Fresh user-data directory created"
echo ""

# Step 3: Prepare demo workspace
echo "${BLUE}Step 3/6: Preparing demo workspace${NC}"

# Clean and recreate demo workspace
rm -rf "$DEMO_WORKSPACE"
mkdir -p "$DEMO_WORKSPACE"

# Create .snapbackrc with demo-critical rules
cat > "$DEMO_WORKSPACE/.snapbackrc" <<'EOF'
{
  "version": "1.0",
  "protectionRules": [
    {
      "pattern": "**/*.env",
      "level": "block",
      "reason": "Environment files contain secrets"
    },
    {
      "pattern": "**/config/production.ts",
      "level": "block",
      "reason": "Production configuration"
    },
    {
      "pattern": "**/api/*.ts",
      "level": "warn",
      "reason": "API endpoints need review"
    }
  ]
}
EOF

# Create sample API files
mkdir -p "$DEMO_WORKSPACE/api"

cat > "$DEMO_WORKSPACE/api/auth.ts" <<'EOF'
/**
 * Authentication API
 * Demo file for SnapBack YC presentation
 */

interface AuthRequest {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string;
  expiresAt: number;
}

export async function login(req: AuthRequest): Promise<AuthResponse> {
  // TODO: Implement authentication logic
  return {
    token: "demo-token-" + Date.now(),
    expiresAt: Date.now() + 3600000
  };
}

export async function logout(token: string): Promise<void> {
  // TODO: Implement logout logic
  console.log("Logging out token:", token);
}
EOF

cat > "$DEMO_WORKSPACE/api/users.ts" <<'EOF'
/**
 * User Management API
 * Demo file for SnapBack YC presentation
 */

interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

export async function getUser(id: string): Promise<User | null> {
  // TODO: Fetch user from database
  return {
    id,
    email: "demo@snapback.dev",
    name: "Demo User",
    createdAt: Date.now()
  };
}

export async function createUser(email: string, name: string): Promise<User> {
  // TODO: Create user in database
  return {
    id: "user-" + Date.now(),
    email,
    name,
    createdAt: Date.now()
  };
}
EOF

cat > "$DEMO_WORKSPACE/api/database.ts" <<'EOF'
/**
 * Database Connection
 * Demo file for SnapBack YC presentation
 */

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

export class Database {
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // TODO: Establish database connection
    console.log("Connecting to:", this.config.host);
  }

  async disconnect(): Promise<void> {
    // TODO: Close database connection
    console.log("Disconnecting from database");
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    // TODO: Execute SQL query
    console.log("Query:", sql, params);
    return [];
  }
}
EOF

# Create .env file (should be BLOCK protected)
cat > "$DEMO_WORKSPACE/.env" <<'EOF'
# Demo environment variables
# This file should be BLOCK protected by .snapbackrc

DATABASE_URL=postgresql://localhost:5432/demo
API_KEY=demo_key_12345
JWT_SECRET=demo_secret_abcde
EOF

# Create package.json
cat > "$DEMO_WORKSPACE/package.json" <<'EOF'
{
  "name": "snapback-demo-workspace",
  "version": "1.0.0",
  "description": "Demo workspace for SnapBack YC presentation",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Demo workspace\""
  },
  "dependencies": {},
  "devDependencies": {}
}
EOF

# Create tsconfig.json
cat > "$DEMO_WORKSPACE/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

echo "${GREEN}✓${NC} Demo workspace prepared with:"
echo "  - .snapbackrc (BLOCK: *.env, production config; WARN: API files)"
echo "  - api/auth.ts (authentication endpoints)"
echo "  - api/users.ts (user management)"
echo "  - api/database.ts (database connection)"
echo "  - .env (should be BLOCK protected)"
echo ""

# Step 4: Create VS Code settings for demo
echo "${BLUE}Step 4/6: Configuring VS Code settings${NC}"

mkdir -p "$DEMO_USER_DATA/User"

cat > "$DEMO_USER_DATA/User/settings.json" <<'EOF'
{
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.welcomePage.walkthroughs.openOnInstall": false,
  "extensions.autoUpdate": false,
  "extensions.autoCheckUpdates": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "security.workspace.trust.enabled": false,
  "window.restoreWindows": "none",
  "editor.fontSize": 16,
  "editor.fontFamily": "Menlo, Monaco, 'Courier New', monospace",
  "editor.lineHeight": 24,
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.iconTheme": "vs-seti",
  "terminal.integrated.fontSize": 14,
  "snapback.protectionLevels.defaultLevel": "watch",
  "snapback.snapshot.deduplication.enabled": true,
  "snapback.offlineMode.enabled": false
}
EOF

echo "${GREEN}✓${NC} Demo settings configured"
echo ""

# Step 5: Determine VS Code executable
echo "${BLUE}Step 5/6: Locating VS Code executable${NC}"

VSCODE_BIN=""

if command -v code &> /dev/null; then
    VSCODE_BIN="code"
elif command -v code-insiders &> /dev/null; then
    VSCODE_BIN="code-insiders"
elif [ -f "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
    VSCODE_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
elif [ -f "$HOME/.vscode/cli/code" ]; then
    VSCODE_BIN="$HOME/.vscode/cli/code"
else
    echo "${RED}✗${NC} VS Code executable not found"
    echo ""
    echo "Please install VS Code or add it to PATH"
    exit 1
fi

echo "${GREEN}✓${NC} Found VS Code: $VSCODE_BIN"
echo ""

# Step 6: Launch VS Code with demo environment
echo "${BLUE}Step 6/6: Launching VS Code${NC}"
echo ""
echo "Configuration:"
echo "  Workspace: $DEMO_WORKSPACE"
echo "  User Data: $DEMO_USER_DATA"
echo "  Extension: $VSIX_FILE"
echo ""
echo "${YELLOW}Launching VS Code...${NC}"
echo ""

# Launch VS Code with demo configuration
"$VSCODE_BIN" \
  --user-data-dir="$DEMO_USER_DATA" \
  --install-extension="$VSIX_ABSOLUTE" \
  --disable-extensions \
  --disable-updates \
  --disable-gpu \
  --skip-welcome \
  --skip-release-notes \
  --disable-workspace-trust \
  "$DEMO_WORKSPACE"

echo ""
echo "${GREEN}✓ Demo environment launched${NC}"
echo ""
echo "Demo Instructions:"
echo "  1. Wait for extension to activate (<2s)"
echo "  2. Check status bar for SnapBack icon"
echo "  3. Try editing api/auth.ts (should be WARN level)"
echo "  4. Try editing .env (should be BLOCK level)"
echo "  5. Create snapshot, then restore to verify rollback"
echo ""
echo "Ready for demo recording! 🎬"
