# SnapBack Sandbox Security Tests

This directory contains test files for verifying the security features of the SnapBack configuration sandbox.

## Test Files

### Core Functionality Tests

-   `test-simple.js` - Basic sandbox functionality test
-   `test-sandbox.js` - General sandbox execution test
-   `test-sandbox-executor.js` - Test for the sandbox executor

### Security Feature Tests

-   `test-flags.js` - Tests Node.js security flags enforcement
-   `test-module-load.js` - Tests forbidden module loading protection
-   `test-module-load-direct.js` - Direct module loading test
-   `test-module-load-sandbox.js` - Sandbox module loading test
-   `test-circular.js` - Circular reference detection test
-   `test-proxy-symbol.js` - Proxy and symbol key detection test
-   `test-symbol-keys.js` - Symbol key detection test
-   `test-proxy-detection.js` - Proxy detection test

### Memory and Performance Tests

-   `test-memory-bomb.js` - Memory limit enforcement test
-   `test-memory-monitoring.js` - Memory monitoring test
-   `test-memory-monitoring2.js` - Alternative memory monitoring test

### Frozen Intrinsics Tests

-   `test-frozen-intrinsics.js` - Basic frozen intrinsics test
-   `test-frozen-intrinsics-real.js` - Real frozen intrinsics test
-   `test-frozen-intrinsics-sandbox.js` - Sandbox frozen intrinsics test
-   `test-frozen.js` - Frozen object test
-   `test-prototype-freeze.js` - Prototype freezing test
-   `test-prototype-freeze2.js` - Alternative prototype freezing test

### Debugging Utilities

-   `debug-isplainobject.js` - Debug isPlainObject function
-   `debug-valid-pojo.js` - Debug valid POJO detection
-   `test-debug.js` - General debugging test
-   `test-direct.js` - Direct execution test

### Summary

-   `test-sandbox-summary.js` - Summary of all security features

## Usage

Run any test file directly with Node.js:

```bash
node test-simple.js
```

These tests help verify that the sandbox security features are working correctly and can be used during development to validate changes to the sandbox implementation.
