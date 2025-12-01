# Timeline API Permanent Fix for SnapBack Extension

## Problem

The SnapBack VS Code extension was encountering the following error:

```
Extension 'MarcelleLabs.snapback-vscode CANNOT USE these API proposals 'timeline'. You MUST start in extension development mode or use the --enable-proposed-api command line flag
```

## Root Cause

The extension was not being run with the proper flags to enable the proposed timeline API. While the extension was correctly configured with `enabledApiProposals: ["timeline"]` in package.json and had the proper TypeScript definitions, VS Code requires either:

1. The `--enable-proposed-api` command line flag, or
2. Configuration in the `argv.json` file to permanently enable proposed APIs

## Solution Implemented

### 1. Permanent Configuration via argv.json

Created `~/Library/Application Support/Code/argv.json` with:

```json
{
	"enable-proposed-api": ["MarcelleLabs.snapback-vscode"]
}
```

This ensures the timeline API is always available when running the extension.

### 2. Development Script

Created `scripts/run-with-timeline-api.sh`:

```bash
#!/bin/bash
code --enable-proposed-api MarcelleLabs.snapback-vscode "$@"
```

### 3. NPM Script

Added to package.json scripts:

```json
"dev:timeline": "./scripts/run-with-timeline-api.sh"
```

## Usage

To run VS Code with the SnapBack extension and timeline API enabled:

```bash
pnpm run dev:timeline
```

Or manually:

```bash
code --enable-proposed-api MarcelleLabs.snapback-vscode .
```

## Verification

1. ✅ Timeline API proposal is enabled in package.json
2. ✅ Proposed API types are downloaded (`vscode.proposed.timeline.d.ts`)
3. ✅ TypeScript compilation passes without errors
4. ✅ Extension packages successfully
5. ✅ Extension installs successfully
6. ✅ Timeline integration works correctly

## Prevention

The argv.json configuration ensures this issue won't happen again, as the timeline API will be permanently enabled for this extension.
