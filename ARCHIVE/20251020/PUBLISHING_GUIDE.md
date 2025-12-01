# SnapBack Extension Publishing Guide

## Prerequisites

1. **Personal Access Token (PAT)**: You need a PAT from the Azure DevOps portal to publish extensions.

### Creating a Personal Access Token

1. Go to https://dev.azure.com/
2. Sign in with your Microsoft account
3. Navigate to User settings → Personal access tokens
4. Click "New Token"
5. Configure the token:
    - Name: "SnapBack VS Code Extension Publishing"
    - Organization: All accessible organizations
    - Expiration: Set an appropriate expiration date
    - Scopes: Select "All scopes" or specifically "Marketplace (publish)"
6. Click "Create"
7. Copy the generated token (you won't see it again)

## Publishing Process

### Option 1: Using Environment Variable (Recommended)

1. Set the PAT as an environment variable:

    ```bash
    export VSCE_PAT=your-personal-access-token-here
    ```

2. Run the deploy script:
    ```bash
    cd /Users/user1/WebstormProjects/SnapBack-Site/apps/vscode
    npm run deploy
    ```

### Option 2: Direct Command

Run the publish command directly with your PAT:

```bash
cd /Users/user1/WebstormProjects/SnapBack-Site/apps/vscode
npx vsce publish --pat your-personal-access-token-here --no-dependencies
```

## Version Management

The extension is currently at version 1.1.3. To publish a new version:

1. Update the version in `package.base.json`
2. Run the build script to update `package.json`:
    ```bash
    npm run build:package
    ```
3. Package the extension:
    ```bash
    npm run package-vsix
    ```
4. Publish using one of the methods above

## Pre-Publish Checklist

-   [ ] Verify all tests pass: `npm test`
-   [ ] Check TypeScript compilation: `npm run check-types`
-   [ ] Verify packaging works: `npm run package-vsix`
-   [ ] Review changelog and documentation
-   [ ] Ensure PAT is valid and has correct permissions

## Troubleshooting

### "Extension already exists" Error

If you get an error that the extension version already exists, you can either:

1. Increment the version number in `package.base.json`
2. Use the `--skip-duplicate` flag to fail silently

### Authentication Errors

-   Verify your PAT is correct and has not expired
-   Ensure the PAT has "Marketplace (publish)" permissions
-   Check that you're publishing under the correct publisher ID ("MarcelleLabs")

### Dependency Issues

The extension uses `--no-dependencies` flag as it bundles all dependencies during the build process. This is the correct approach for VS Code extensions.
