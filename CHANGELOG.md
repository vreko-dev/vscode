# Change Log

All notable changes to the "SnapBack" extension will be documented in this file.

## [1.2.4] - 2025-10-21

### Changed

#### Marketplace Compliance

-   **Removed Timeline API Integration**: Removed all usage of proposed Timeline API to comply with VS Code Marketplace requirements
    -   Removed `enabledApiProposals` from package.json
    -   Archived timeline provider implementation for future re-enablement
    -   Updated onboarding walkthrough to remove Timeline View references
    -   All snapshots remain accessible via SnapBack sidebar and Protected Files view

### Technical

-   **API Stability**: Extension now uses only stable VS Code APIs
-   **Code Organization**: Timeline provider code preserved in `ARCHIVE/timeline-api-removed/` for future restoration
-   **Documentation**: Updated user-facing walkthrough to focus on SnapBack sidebar instead of Timeline panel
-   **Build Quality**: Maintained bundle size at 912KB with zero compilation errors

### Migration Notes

-   **No Action Required**: Existing users will see no breaking changes
-   **Timeline Users**: Snapshots previously visible in Timeline panel are now accessed via:
    -   SnapBack sidebar (click 🧢 icon in Activity Bar)
    -   Protected Files view (in Explorer sidebar)
    -   Command Palette (search "SnapBack")
-   **Future**: Timeline integration will return when VS Code stabilizes the Timeline API

## [0.3.1] - 2025-10-09

### 🎉 Major Features

#### Protection Levels

The biggest feature in this release! SnapBack now offers three configurable protection levels to match your workflow and file criticality:

-   **🟢 Watch**: Silent auto-checkpointing with intelligent debouncing (5-minute checkpoint intervals)
-   **🟡 Warn**: Confirmation prompt before save with checkpoint option and skip capability (5-minute debounce)
-   **🔴 Block**: Required checkpoint or explicit override with modal dialog (no debounce—always prompts)

Each level provides different behavior when you save a protected file, giving you fine-grained control over your protection strategy.

### Added

-   **Protection Level Selection UI**: Interactive quick picker with emoji indicators and descriptions
-   **File Decoration Badges**: Visual indicators in Explorer showing protection level (🟢 🟡 🔴)
-   **New Commands**:
    -   `SnapBack: Protect File...` - Protect file with level selection
    -   `SnapBack: Change Protection Level...` - Change existing file's protection level
    -   `SnapBack: Set Protection: Watch (Silent)` - Quick-set to Watch level
    -   `SnapBack: Set Protection: Warn (Prompt)` - Quick-set to Warn level
    -   `SnapBack: Set Protection: Block (Required)` - Quick-set to Block level
-   **Context Menu Submenu**: "Quick Set Level" submenu for fast protection level changes
-   **Structured Logging System**: Configurable logging with `snapback.logLevel` setting (debug, info, warn, error)
-   **Configuration Options**:
    -   `snapback.logLevel` - Control logging verbosity for debugging
    -   `snapback.showAutoCheckpointNotifications` - Toggle Watch level notifications
-   **File Watcher Integration**: Automatic cleanup when protected files are deleted from disk
-   **ProtectedFileRegistry Events**: `onProtectionChanged` event for decoration updates

### Changed

-   **ProtectedFileRegistry**: Now stores and manages protection level per file
-   **SaveHandler**: Uses protection level to determine save behavior (watch/warn/block)
-   **File Decorations**: Show level-specific colors and badge icons
-   **Command Discoverability**: All protection commands now visible in Command Palette
-   **Error Messages**: Improved UX with clearer, more actionable error messages
-   **Test Infrastructure**: Extracted `ProtectionLevelSelector` UI component for better testability

### Fixed

-   **File Deletion Handling**: Protected files deleted from disk no longer leave orphaned entries in registry
-   **TypeScript Compilation**: Resolved all compilation errors in test infrastructure
-   **SaveHandler Error Handling**: Improved debouncing and error recovery
-   **Mock Utilities**: Added missing `getProtectionLevel()` method to registry mocks
-   **Type Safety**: Added proper TypeScript types for all protection level operations

### Developer Experience

-   **Comprehensive Test Suite**: 50+ tests covering all protection level scenarios
-   **Code Organization**: Extracted UI components for better separation of concerns
-   **Logging Infrastructure**: Replaced 28 `console.log` calls with structured logger
-   **Test Helpers**: Added reusable mock utilities and test helpers
-   **Documentation**: Improved inline code documentation and JSDoc comments

### Breaking Changes

None. This release is fully backward compatible:

-   Files protected in v0.3.0 or earlier automatically default to Watch level
-   All existing commands continue to work
-   No configuration migration required

### Migration Guide

If you have protected files from v0.3.0 or earlier, they will automatically be treated as **Watch level** (silent auto-checkpointing). No action is required.

To assign different protection levels to your existing protected files:

1. Right-click the file in Explorer
2. Select "SnapBack: Change Protection Level..."
3. Choose your desired level: Watch, Warn, or Block

### Performance Improvements

-   **O(1) Protection Lookups**: Optimized `isProtected()` checks with Set-based index
-   **Intelligent Debouncing**: Separate debounce timers per file for Watch level
-   **Event Batching**: Efficient decoration updates with event emitters

### Known Issues

-   Folder-level protection not yet supported (per-file protection only)
-   Bulk protection operations require individual file selection
-   File decorations may require window reload after extension update

### Coming Soon

-   Folder protection (protect all files in a directory)
-   Bulk protection operations
-   Protection templates (pre-configured protection rules)
-   Export/import protection configurations
-   Team sharing of protection settings

## 0.2.1

### Patch Changes

-   # Packaging Process Enhancements
    -   Integrated Changesets into the packaging workflow
    -   Added new scripts for automated versioning and packaging:
        -   `package-with-changeset` - Versions packages and creates VSIX
        -   `release` - Publishes packages to the registry
    -   Improved build process reliability

## 0.2.0

### Minor Changes

-   # Automated Packaging Workflow
    -   Enhanced packaging process with integrated Changesets workflow
    -   Added new npm scripts for streamlined release process:
        -   `package-with-changeset` - Automates versioning and packaging
        -   `package-vsce-no-deps` - Packages VSIX with dependency bypass
        -   `release` - Publishes to registry
    -   Improved build reliability and consistency

### Minor Changes

-   # Chat API and Icon Enhancements
    -   Added basic chat API with three commands:
        -   `@snapback create` - Creates a new snapshot
        -   `@snapback list` - Lists the last 10 snapshots
        -   `@snapback restore <id>` - Restores to a specific snapshot (with picker fallback)
    -   Implemented custom SVG icon for consistent visual experience across all access points
    -   Updated activity bar and chat participant to use snapback-vscode-icon.svg
    -   Improved error handling and user feedback in chat responses

## 0.1.1

### Patch Changes

-   Fix storage initialization to use workspace root instead of process.cwd() and improve view focus handling
-   Updated dependencies
    -   @snapback/core@0.1.1
    -   @snapback/storage@0.0.1
    -   @snapback/telemetry@1.0.1

## [0.1.0] - 2024-XX-XX

### Added

-   Initial release
-   Core snapshot creation and restoration
-   AI-powered change detection
-   Real-time file monitoring
-   Status bar integration
-   Configuration options for customization

### Features

-   Manual snapshot creation
-   Automatic snapshot restoration
-   AI monitoring toggle
-   Protection status display
-   Configurable auto-initialization
-   Adjustable snapshot intervals
