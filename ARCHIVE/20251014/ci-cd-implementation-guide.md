# CI/CD Implementation Guide for SnapBack VS Code Extension

This guide provides a comprehensive overview of the CI/CD improvements implemented for the SnapBack VS Code extension, following VS Code Extension API best practices and marketplace requirements.

## Overview of Improvements

### 1. New GitHub Actions Workflow

A new comprehensive workflow `publish-vscode-extension.yml` has been created with the following features:

-   **Multi-platform publishing**: Supports Windows, Linux, and macOS targets
-   **Pre-release support**: Option to publish pre-release versions
-   **Quality gates**: Comprehensive validation before publishing
-   **Dual marketplace publishing**: Publishes to both VS Code Marketplace and Open VSX Registry
-   **Artifact retention**: Stores VSIX files as GitHub Actions artifacts

### 2. Enhanced Manifest Validation

Added a new validation script `validate-manifest.js` that checks:

-   Required fields in package.json
-   Proper configuration of extension metadata
-   Native module declarations
-   Script availability
-   Marketplace readiness

### 3. Improved Extension Metadata

Updated package.json with:

-   `pricing` field for marketplace visibility
-   `sponsor` field to support the project
-   Enhanced repository information
-   License specification

## Implementation Details

### Native Module Handling

The SnapBack extension uses `better-sqlite3` as a native module, which requires special consideration:

1. **Externalization**: The module is marked as external in esbuild configuration to prevent bundling
2. **Post-install rebuilding**: A postinstall script attempts to rebuild the module for Electron compatibility
3. **Platform-specific packaging**: The workflow supports publishing for multiple target platforms

### Build Process

The extension uses esbuild for fast bundling with proper externalization:

```javascript
external: [
	"vscode", // ONLY vscode should be external
	"better-sqlite3", // Native module that should not be bundled
];
```

### Publishing Strategy

The new workflow supports:

1. **Standard publishing**: Publishes a universal VSIX file
2. **Platform-specific publishing**: Builds and publishes separate VSIX files for each platform
3. **Pre-release publishing**: Supports publishing pre-release versions
4. **Automated versioning**: Integrates with existing Changesets workflow

## Required Configuration

### GitHub Secrets

For the publishing workflow to function, these secrets must be configured in GitHub:

1. `VSCE_PAT` - Personal Access Token for VS Code Marketplace
2. `OVSX_PAT` - Personal Access Token for Open VSX Registry (optional)
3. `NPM_TOKEN` - NPM token for dependency installation (if private packages are used)

### Personal Access Token Setup

To create a Personal Access Token (PAT):

1. Go to https://dev.azure.com
2. Create a new PAT with `Marketplace (Manage)` scope
3. Store it as `VSCE_PAT` in GitHub secrets

### Open VSX Registry Token

To publish to Open VSX Registry:

1. Go to https://open-vsx.org
2. Create an account and namespace
3. Generate a PAT and store it as `OVSX_PAT` in GitHub secrets

## Workflow Triggers

The new workflow is triggered by:

1. **Release creation**: Automatically runs when a new GitHub release is published
2. **Manual dispatch**: Can be triggered manually with optional parameters

### Manual Dispatch Parameters

When triggering manually, you can specify:

-   `version`: Specific version to publish
-   `pre_release`: Whether to publish as a pre-release
-   `target_platforms`: Comma-separated list of platforms to target

## Quality Gates

Before publishing, the workflow runs several validation steps:

1. **Dependency installation**: Ensures all dependencies are correctly installed
2. **Build process**: Compiles the extension with esbuild
3. **Type checking**: Validates TypeScript types
4. **Linting**: Checks code quality with Biome
5. **Manifest validation**: Ensures package.json is correctly configured
6. **Unit tests**: Runs unit test suite
7. **Storage tests**: Validates SQLite storage functionality
8. **Bundle size check**: Ensures extension size is within limits
9. **Source map verification**: Confirms production builds don't include source maps

## Multi-Platform Support

Since SnapBack includes native modules (`better-sqlite3`), the workflow configures platform-specific packaging for:

-   `win32-x64`
-   `win32-arm64`
-   `linux-x64`
-   `linux-arm64`
-   `darwin-x64`
-   `darwin-arm64`

The workflow publishes all platforms simultaneously using:

```bash
vsce publish --target win32-x64 win32-arm64 linux-x64 darwin-x64 darwin-arm64
```

## Artifact Management

The workflow uploads several artifacts:

1. **Extension VSIX**: The packaged extension file
2. **Platform-specific VSIX files**: Separate files for each target platform
3. **Test results**: Coverage reports and test outputs

Artifacts are retained for 7-90 days depending on the type.

## Performance Monitoring

The implementation includes:

1. **Bundle size monitoring**: Prevents extension bloat with 1MB limit
2. **Daily performance benchmarks**: Tracks extension performance over time
3. **Test coverage enforcement**: Maintains quality with coverage thresholds

## Security Considerations

1. **Secret management**: All tokens are stored as GitHub secrets
2. **Dependency verification**: Uses frozen lockfile for consistent builds
3. **Native module handling**: Properly manages ABI compatibility

## Troubleshooting

### Common Issues

1. **Native module loading failures**:

    - Ensure `better-sqlite3` is properly rebuilt for the target Electron version
    - Check that the postinstall script runs successfully
    - Verify that the module is marked as external in the build configuration

2. **Bundle size exceeded**:

    - Run `npm run check:bundle-size` to identify large dependencies
    - Externalize additional modules if appropriate
    - Optimize code to reduce bundle size

3. **Publishing failures**:
    - Verify that `VSCE_PAT` secret is correctly configured
    - Check that the publisher ID matches the one associated with the PAT
    - Ensure version number is unique and follows semantic versioning

### Local Testing

For local testing and publishing:

```bash
# Validate manifest
npm run validate:manifest

# Package the extension
npm run package-vsix

# Install locally for testing
code --install-extension snapback-vscode-*.vsix --force

# Publish to marketplace
npm run deploy
```

## Best Practices Implemented

1. **Semantic versioning**: Follows proper versioning scheme
2. **Pre-release support**: Supports development and stable release cycles
3. **Bundle size optimization**: Keeps extension lightweight
4. **Source map exclusion**: Prevents exposing source code in production
5. **Comprehensive testing**: Validates functionality before publishing
6. **Multi-platform support**: Ensures compatibility across operating systems
7. **Marketplace readiness**: Includes all required metadata and assets
8. **Security conscious**: Properly handles secrets and dependencies

## Future Improvements

Consider implementing:

1. **Automated changelog generation**: Integrate with release notes
2. **Integration testing**: Add end-to-end tests for critical workflows
3. **Performance regression detection**: Enhanced benchmarking
4. **Automated rollback**: Revert failed releases
5. **Cross-extension compatibility testing**: Validate with other popular extensions

This implementation follows VS Code Extension API best practices and ensures a robust, secure, and efficient CI/CD pipeline for the SnapBack extension.
