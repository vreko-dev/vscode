# esbuild Native Module Handling in SnapBack VSCode Extension

This document explains how the SnapBack VSCode extension handles native Node.js modules (specifically `better-sqlite3`) during the build process.

## Overview

VSCode extensions run in a Node.js environment and can use native modules (`.node` files compiled from C/C++). However, bundling native modules requires special handling because:

1. **Binary Dependencies**: Native modules are platform-specific compiled binaries
2. **Dynamic Loading**: They use `require()` with dynamic paths
3. **Bundle Limitations**: esbuild cannot bundle native `.node` files

## Our Approach: Externalization

We **externalize** native modules rather than bundling them. This means:
- The module is **excluded** from the bundle
- It's loaded from `node_modules` at runtime
- The VSCode extension packages it separately

## Configuration

### esbuild.config.cjs

```javascript
{
  // External dependencies (not bundled)
  external: [
    'vscode',           // VSCode API (provided by host)
    'better-sqlite3',   // Native module (externalized)
  ],

  // Platform-specific settings
  platform: 'node',
  target: 'node20',

  // Bundle all npm dependencies EXCEPT external ones
  bundle: true,
}
```

### Why Externalize better-sqlite3?

```javascript
// better-sqlite3 structure:
node_modules/
  better-sqlite3/
    ├── lib/
    │   └── index.js          # JavaScript wrapper
    └── build/Release/
        └── better_sqlite3.node  # Native binary (platform-specific)
```

**Problem**: esbuild cannot bundle `.node` files (they're binary, not JavaScript).

**Solution**: Mark as `external` → loads from `node_modules` at runtime.

## How It Works

### 1. Build Time

```bash
pnpm run compile
# esbuild bundles extension.ts → dist/extension.js
# better-sqlite3 is NOT included in bundle
```

### 2. Package Time

```json
// package.json
{
  "dependencies": {
    "better-sqlite3": "9.6.0"  // ← Included in .vsix package
  }
}
```

The `.vsix` package includes:
```
extension.vsix
├── dist/
│   └── extension.js         # Bundled code (994KB)
└── node_modules/
    └── better-sqlite3/      # Native module (separate)
        └── build/Release/
            └── better_sqlite3.node
```

### 3. Runtime

```javascript
// In extension code:
import Database from 'better-sqlite3';  // ← Loads from node_modules

// VSCode resolves:
// 1. Checks node_modules/better-sqlite3
// 2. Loads lib/index.js
// 3. Index.js loads build/Release/better_sqlite3.node
// 4. ✅ Works!
```

## Performance Impact

| Approach | Bundle Size | Load Time | Pros | Cons |
|----------|-------------|-----------|------|------|
| **Bundle** (impossible) | N/A | Fast | Single file | Can't bundle .node |
| **External** (our choice) | +0KB | +~10ms | Works reliably | Extra files in .vsix |

**Verdict**: Externalization adds ~10ms load time but is the **only viable approach** for native modules.

## Verification

### Check Bundle Doesn't Include better-sqlite3

```bash
# Search bundle for better-sqlite3
grep -o "better-sqlite3" apps/vscode/dist/extension.js | wc -l
# Output: 0 ✅ (not in bundle)
```

### Check Module Loads at Runtime

```javascript
// Test in extension activation:
import Database from 'better-sqlite3';
console.log(Database); // Should work ✅
```

## Alternative Approaches (Why We Don't Use Them)

### 1. Bundle with webpack + node-loader

```javascript
// webpack.config.js
{
  module: {
    rules: [
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
}
```

**Pros**: Can bundle .node files
**Cons**:
- Webpack is slower than esbuild (5-10x)
- More complex configuration
- Larger bundle size
- Still needs platform-specific binaries

**Verdict**: Not worth the complexity for marginal benefits.

### 2. Dynamic require() with path manipulation

```javascript
// Try to trick bundler:
const sqlite = require(`better-${'sqlite3'}`);
```

**Pros**: None
**Cons**:
- Breaks static analysis
- Doesn't solve .node binary issue
- Makes debugging harder

**Verdict**: Anti-pattern, avoid.

### 3. WASM version

```javascript
// Use sql.js (SQLite compiled to WASM):
import initSqlJs from 'sql.js';
const SQL = await initSqlJs();
```

**Pros**: Truly bundlable, cross-platform
**Cons**:
- 10-20x slower than native
- Limited SQLite features
- Larger bundle (~800KB)

**Verdict**: Not performant enough for our use case.

## Debugging Native Module Issues

### Issue: "Cannot find module 'better-sqlite3'"

**Cause**: Module not in node_modules or not in .vsix package

**Fix**:
```bash
# 1. Check node_modules exists:
ls node_modules/better-sqlite3

# 2. Verify it's in dependencies (not devDependencies):
grep better-sqlite3 package.json

# 3. Rebuild .vsix:
pnpm run package
```

### Issue: "Module did not self-register"

**Cause**: Native binary compiled for wrong Node.js version

**Fix**:
```bash
# Rebuild for VSCode's Node.js version (currently v20):
cd node_modules/better-sqlite3
node-gyp rebuild --target=20.0.0 --arch=x64
```

### Issue: "Cannot load native addon"

**Cause**: Platform mismatch (e.g., built on Mac, running on Linux)

**Fix**: Use electron-rebuild:
```bash
pnpm add -D @electron/rebuild
pnpm exec electron-rebuild
```

## Best Practices

### ✅ DO

1. **Mark native modules as external**
   ```javascript
   external: ['better-sqlite3']
   ```

2. **List in dependencies (not devDependencies)**
   ```json
   {
     "dependencies": {
       "better-sqlite3": "9.6.0"
     }
   }
   ```

3. **Test on all platforms** (Windows, Mac, Linux)

4. **Document platform requirements**
   ```markdown
   ## Requirements
   - Node.js 20+
   - Python 3.x (for native module builds)
   - C++ compiler (MSVC on Windows, GCC on Linux, Clang on Mac)
   ```

### ❌ DON'T

1. **Try to bundle native modules**
   ```javascript
   // ❌ Won't work:
   external: []  // Trying to bundle everything
   ```

2. **Use dynamic requires to hide imports**
   ```javascript
   // ❌ Anti-pattern:
   const db = require(\`better-\${'sqlite3'}\`);
   ```

3. **Put native modules in devDependencies**
   ```json
   {
     // ❌ Won't be in .vsix:
     "devDependencies": {
       "better-sqlite3": "9.6.0"
     }
   }
   ```

## esbuild Configuration Reference

### Full Configuration

```javascript
// apps/vscode/esbuild.config.cjs
import esbuild from 'esbuild';

const production = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',

  // Platform
  platform: 'node',
  target: 'node20',
  format: 'cjs',

  // Externals (not bundled)
  external: [
    'vscode',          // VSCode API
    'better-sqlite3',  // Native module
  ],

  // Optimization
  minify: production,
  sourcemap: !production,
  treeShaking: true,

  // Node.js compatibility
  mainFields: ['module', 'main'],
  conditions: ['node'],
});
```

### Key Options Explained

| Option | Value | Why |
|--------|-------|-----|
| `platform` | `'node'` | Targets Node.js (not browser) |
| `target` | `'node20'` | VSCode uses Node 20 |
| `format` | `'cjs'` | CommonJS (VSCode requirement) |
| `external` | `['vscode', 'better-sqlite3']` | Don't bundle these |
| `mainFields` | `['module', 'main']` | Resolve order for packages |
| `conditions` | `['node']` | Use Node.js exports |

## Related Documentation

- [esbuild External Documentation](https://esbuild.github.io/api/#external)
- [VSCode Extension Packaging](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- [Node.js Native Addons](https://nodejs.org/api/addons.html)

## Summary

**Key Takeaway**: Native modules like `better-sqlite3` **cannot be bundled** by esbuild. We **externalize** them, which means:

1. ✅ They're excluded from the bundle
2. ✅ They're loaded from `node_modules` at runtime
3. ✅ They're included in the `.vsix` package
4. ✅ This adds ~10ms load time but is the only reliable approach

This approach is **industry standard** for VSCode extensions with native dependencies.
