# Future Enhancements Roadmap

This document tracks planned future enhancements for the SnapBack VS Code extension that are not part of the current production implementation.

## Timeline Provider Integration

**Status**: Archived / Future Consideration
**Priority**: Medium
**Estimated Effort**: 3 days

### Description
The VS Code TimelineProvider API was previously implemented in SnapBack but has been archived due to the API remaining in experimental/proposed status. This integration would allow SnapBack snapshots to appear in VS Code's built-in Timeline view.

### Reason for Archiving
The TimelineProvider API is still experimental/proposed and not stable for production extensions. Using it would require:
- Dependency on VS Code Insiders builds
- Risk of API changes breaking the extension
- Incompatibility with stable VS Code releases

### Implementation Details (When API Becomes Stable)
1. Restore `SnapshotTimelineProvider` from archive
2. Update to use current snapshot data structures
3. Register timeline provider in extension activation
4. Add proper testing for timeline integration
5. Update documentation and user guides

### Files Previously Implementing This Feature
- `apps/vscode/ARCHIVE/timeline-api-removed/snapshotTimelineProvider.ts`
- Related test files in the archive

### Prerequisites
- VS Code TimelineProvider API moves from proposed to stable status
- API is available in stable VS Code releases

### Benefits
- Native integration with VS Code's timeline UI
- Familiar interface for developers accustomed to timeline views
- Consistent with other VS Code extension patterns

### References
- [VS Code Timeline API Documentation](https://code.visualstudio.com/api/extension-guides/timeline)
- [Using Proposed APIs](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)