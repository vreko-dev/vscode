# VS Code Extension CI/CD Best Practices for SnapBack

This document outlines the best practices and implementation guidelines for continuous integration and deployment of the SnapBack VS Code extension.

## GitHub Actions Workflows

### 1. New Publish Workflow (`publish-vscode-extension.yml`)

A comprehensive workflow has been created that handles:

-   **Multi-platform publishing**: Builds and publishes platform-specific versions for Windows, Linux, and macOS
-   **Pre-release support**: Option to publish pre-release versions
-   **Quality gates**: Runs tests and validation before publishing
-   **Dual marketplace publishing**: Publishes to both VS Code Marketplace and Open VSX Registry
-   **Artifact retention**: Stores VSIX files as GitHub Actions artifacts

### 2. Enhanced Existing Workflows

The existing `publish-extension.yml` workflow has been updated to:

-   Use the latest PNPM version (10.14.0)
-   Add frozen lockfile installation for consistency
-   Include dependency building steps
-   Maintain backward compatibility

## Packaging Best Practices

### Native Module Handling

The SnapBack extension uses `better-sqlite3` as a native module, which requires special handling:

1. **Externalization**: The module is marked as external in the esbuild configuration to prevent bundling
2. **Post-install rebuilding**: A postinstall script attempts to rebuild the module for Electron compatibility
3. **Platform-specific packaging**: The new workflow supports publishing for multiple target platforms

### Bundle Size Management

-   Extension bundle size is monitored and limited to 1MB
-   Source maps are excluded from production builds
-   Dependencies are properly externalized to reduce bundle size

## Publishing Strategy

### Version Management

-   Uses semantic versioning with the existing version `1.0.9`
-   Supports automated version bumping using `vsce publish minor` or `vsce publish patch`
-   Integrates with Changesets for monorepo version coordination

### Multi-Platform Support

Since SnapBack includes native modules, platform-specific packaging is configured for:

-   `win32-x64`
-   `win32-arm64`
-   `linux-x64`
-   `linux-arm64`
-   `darwin-x64`
-   `darwin-arm64`

### Marketplace Assets

Ensure these files are present and up-to-date:

-   `README.md` - Marketplace description
-   `CHANGELOG.md` - Version history
-   `LICENSE` - License information
-   Icon at 128x128px minimum (currently using 256px)

## Pre-publish Validation

The CI/CD pipeline includes these checks before publishing:

-   Type checking
-   Linting
-   Manifest validation
-   Unit tests
-   Storage tests
-   Bundle size verification
-   Source map exclusion verification

## Security Considerations

-   Personal Access Tokens (PAT) are stored as GitHub secrets
-   Dependencies are installed with frozen lockfile to ensure consistency
-   Native modules are properly handled to prevent ABI compatibility issues

## Performance Monitoring

-   Daily performance benchmarks track extension performance
-   Bundle size analysis prevents bloat
-   Test coverage is monitored and enforced

## Required Secrets

For the publishing workflow to function, these secrets must be configured in GitHub:

1. `VSCE_PAT` - Personal Access Token for VS Code Marketplace
2. `OVSX_PAT` - Personal Access Token for Open VSX Registry (optional)
3. `NPM_TOKEN` - NPM token for dependency installation (if private packages are used)

## Manual Publishing Commands

For local testing and publishing:

```bash
# Package the extension
npm run package-vsix

# Install locally for testing
code --install-extension snapback-vscode-*.vsix --force

# Publish to marketplace
npm run deploy
```

## Troubleshooting

### Native Module Issues

If the extension fails to load due to native module issues:

1. Ensure `better-sqlite3` is properly rebuilt for the target Electron version
2. Check that the postinstall script runs successfully
3. Verify that the module is marked as external in the build configuration

### Bundle Size Exceeded

If the bundle size exceeds the 1MB limit:

1. Run `npm run check:bundle-size` to identify large dependencies
2. Externalize additional modules if appropriate
3. Optimize code to reduce bundle size

### Publishing Failures

If publishing fails:

1. Verify that `VSCE_PAT` secret is correctly configured
2. Check that the publisher ID matches the one associated with the PAT
3. Ensure version number is unique and follows semantic versioning
