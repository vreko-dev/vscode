import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  // Minimal test - just the extension load test for quick validation
  files: 'out/test/suite/extension-load.test.js',

  // VS Code version to use for testing (matches engine requirement)
  version: '1.99.0',

  // Workspace folder for testing
  workspaceFolder: './test-fixtures',

  // Launch arguments for VS Code instance
  launchArgs: [
    '--disable-extensions',      // Don't load other extensions
    '--disable-workspace-trust'  // Skip workspace trust dialog
  ],

  // Mocha test runner configuration (shorter timeout for quick tests)
  mocha: {
    ui: 'tdd',           // Test-driven development style (suite/test)
    color: true,         // Colored output
    timeout: 30000       // 30 second timeout for minimal tests
  }
});
