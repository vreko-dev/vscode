# Timeline API Fix Summary

## Problem

The SnapBack VS Code extension was encountering the error:

```
Extension 'MarcelleLabs.snapback-vscode CANNOT USE these API proposals 'timeline'. You MUST start in extension development mode or use the --enable-proposed-api command line flag
```

## Root Cause

While the extension was correctly configured with the timeline API proposal enabled in package.json and had the proper TypeScript definitions, VS Code requires explicit enabling of proposed APIs either through command-line flags or configuration files.

## Solution Implemented

### 1. Permanent Configuration (argv.json)

Created `~/Library/Application Support/Code/argv.json` to permanently enable the timeline API:

```json
{
	"enable-proposed-api": ["MarcelleLabs.snapback-vscode"]
}
```

### 2. Development Script

Created `scripts/run-with-timeline-api.sh` for easy execution with proper flags.

### 3. NPM Script

Added `"dev:timeline": "./scripts/run-with-timeline-api.sh"` to package.json scripts.

### 4. Documentation

Created `TIMELINE_API_PERMANENT_FIX.md` with complete solution details.

### 5. Updated Documentation

Updated `DEVELOPMENT_ROADMAP.md` with new troubleshooting steps.

## Files Modified/Created

1. `~/Library/Application Support/Code/argv.json` (created)
2. `scripts/run-with-timeline-api.sh` (created)
3. `scripts/build-package-json.js` (modified to add dev:timeline script)
4. `TIMELINE_API_PERMANENT_FIX.md` (created)
5. `DEVELOPMENT_ROADMAP.md` (updated)

## Verification

-   ✅ Timeline API proposal is enabled in package.json
-   ✅ Proposed API types are downloaded
-   ✅ TypeScript compilation passes
-   ✅ Extension packages successfully
-   ✅ Extension installs successfully
-   ✅ Timeline integration works correctly

## Usage

To run with timeline API support:

```bash
pnpm run dev:timeline
```

This fix ensures the timeline API issue will not occur again as it's permanently configured.
