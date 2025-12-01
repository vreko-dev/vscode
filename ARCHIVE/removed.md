# Guardian Code Removal

## Overview
As part of the SnapBack v2 architecture update, we have removed the client-side Guardian code and moved all analysis capabilities to the backend API. This change was made to:

1. Protect intellectual property by keeping proprietary algorithms server-side
2. Improve performance by offloading heavy computation to backend services
3. Enable consistent analysis across all clients
4. Simplify client-side code maintenance

## Files Removed
The following files and directories have been removed from the VSCode extension:

1. `src/guardian/` directory and all its contents
2. All references to the `Guardian` class in:
   - `src/handlers/SaveHandler.ts`
   - `src/ai/fs/agentWatcher.ts`
   - `src/ai/copilot/intercept.ts`
   - `src/providers/DetectionCodeActionProvider.ts`

## Replacement Implementation
The Guardian functionality has been replaced with calls to the backend API:

1. **API Client**: A new `ApiClient` service has been created at `src/services/api-client.ts`
2. **Backend Endpoints**: All analysis is now performed via backend API endpoints:
   - `/api/v1/analyze` - General code analysis
   - `/api/v1/detect-secrets` - Secret detection
   - `/api/v1/policy/evaluate` - Policy evaluation

## Fallback Behavior
When the backend API is unavailable, the extension falls back to basic pattern detection:

1. Simple pattern matching for common security issues
2. Reduced functionality but continued operation
3. Clear user notifications about degraded service

## Benefits of This Change
1. **IP Protection**: Proprietary algorithms are now server-side only
2. **Consistency**: All clients receive the same analysis results
3. **Scalability**: Backend can handle complex analysis with more resources
4. **Maintainability**: Analysis logic is centralized in one location
5. **Performance**: Client-side extension is lighter and faster

## Migration Notes
All existing functionality has been preserved with the following changes:

1. Configuration: API key is now required in VS Code settings
2. Performance: Initial analysis may take slightly longer due to network calls
3. Offline: Basic pattern detection is available when offline
4. Features: All advanced features are still available through the backend

For any issues or questions about this change, please contact the SnapBack development team.