# Phase 22: PostHog Analytics & Telemetry Research

**Date**: 2025-12-04
**Phase**: 22 (Analytics & Telemetry)
**Research Focus**: PostHog SDK patterns, privacy proxy setup, SnapBack telemetry strategy

## 1. PostHog Library Overview

### Selected Library: `posthog-js`
- **Library ID**: `/posthog/posthog-js`
- **Source Reputation**: High
- **Benchmark Score**: 93/100
- **Code Snippets**: 583+ examples
- **Key Strengths**:
  - Full-featured SDK for browser, Node.js, React, React Native
  - Monorepo with `@posthog/web` for web apps, `@posthog/node` for backends
  - First-class feature flag support
  - Session replay and error tracking
  - Built for privacy-first approach with custom domains

## 2. PostHog Core Features for SnapBack

### 2.1 Event Capture Pattern
**SnapBack Events** (map to PostHog's `capture()` API):
```typescript
// TDD Test Pattern
await telemetryCollector.capture('snapshot.created', {
  fileCount: 3,
  riskScore: 75,
  trigger: 'auto-decision',
  timestamp: Date.now()
});

await telemetryCollector.capture('threat.detected', {
  filePath: 'auth.ts',
  riskScore: 85,
  threats: ['ai-detected', 'critical-file'],
  action: 'notify'
});
```

**PostHog API**:
```typescript
posthog.capture('my-event', {
  myProperty: 'foo',
  timestamp: Date.now()
})
```

### 2.2 User Identification Pattern
**SnapBack User Context**:
```typescript
// Identify extension user (VS Code workspace)
await telemetryCollector.identify(workspaceId, {
  workspaceName: 'my-project',
  workspaceRoot: '/home/user/projects/my-app',
  extensionVersion: '1.2.9',
  vscodeVersion: '1.95.0'
});
```

**PostHog API**:
```typescript
posthog.identify('user_id_123', {
  email: 'user@example.com',
  name: 'John Doe'
});
```

### 2.3 User Properties (for segmentation)
```typescript
// Set user properties for filtering
posthog.people.set({
  'plan': 'enterprise',
  'organization': 'Acme Corp',
  'signupDate': '2024-01-15'
});

// Increment counters
posthog.people.increment('api_calls', 1);
```

### 2.4 Opt-in/Opt-out Pattern
**Privacy-First**: Users opt-out, not in
```typescript
// Check if user has opted out
if (!posthog.has_opted_out_capturing()) {
  // User is tracking (default)
  posthog.capture('event');
}

// User can opt out
posthog.optOut(); // Stops all tracking

// User can opt back in
posthog.optIn(); // Resumes tracking
```

## 3. Privacy Proxy Architecture for SnapBack

### 3.1 Problem: Ad Blockers & Privacy Blockers
- PostHog Cloud domains (`*.posthog.com`) are often blocked by:
  - uBlock Origin
  - Pi-hole
  - Privacy Badger
  - Safari Intelligent Tracking Prevention
- **Solution**: Route events through your own domain (custom reverse proxy)

### 3.2 Reverse Proxy Setup (Customer Implementation)
```
User's Browser
    ↓
[Your Domain: posthog.yourdomain.com] ← Reverse Proxy (Cloudflare/nginx/Caddy)
    ↓
PostHog Cloud (app.posthog.com)
```

### 3.3 SnapBack Reverse Proxy Strategy
**For apps/api server** (when backend deployed):
```typescript
// Backend reverse proxy (Node.js server)
app.use('/telemetry', proxyToPostHog());

// PostHog.js initialization on frontend
posthog.init('<api_key>', {
  api_host: 'https://api.yourdomain.com',  // Your domain
  flags_api_host: 'https://flags.yourdomain.com', // Separate for flags
  ui_host: 'https://us.posthog.com' // Dashboard stays at PostHog
});
```

**For VS Code extension** (electron-based):
- No traditional reverse proxy needed (Electron bypasses ad blockers)
- Use direct PostHog Cloud domain OR custom API host if self-hosted

### 3.4 Configuration Options
```typescript
interface PostHogConfig {
  // Core tracking
  api_host: 'https://app.posthog.com', // Default CloudFront

  // Privacy proxy domains (optional)
  flags_api_host?: 'https://flags.yourdomain.com', // Feature flags only

  // Disable capture
  capture_pageview: false, // Don't auto-capture pageviews
  autocapture: false, // Don't auto-capture clicks

  // Session replay (privacy-sensitive)
  session_recording: {
    maskAllTextInputs: true,  // Hide form inputs
    maskAllImages: true,       // Hide images
    recordCanvas: false        // Don't record canvas
  },

  // Debug
  debug: false
}
```

## 4. SnapBack Event Taxonomy

### 4.1 Protection Events
```typescript
{
  'snapshot.created': {
    fileCount: number,
    riskScore: number,
    trigger: 'auto-decision' | 'manual' | 'ai-detected',
    timestamp: number,
    sessionId: string
  },

  'snapshot.restored': {
    snapshotId: string,
    fileCount: number,
    timestamp: number
  },

  'threat.detected': {
    filePath: string,
    riskScore: number,
    threats: string[],
    action: 'snapshot' | 'notify' | 'restore' | 'none',
    confidence: number
  },

  'protection.level_changed': {
    previousLevel: 'watch' | 'warn' | 'block',
    newLevel: 'watch' | 'warn' | 'block',
    reason: string,
    timestamp: number
  }
}
```

### 4.2 User Interaction Events
```typescript
{
  'dashboard.opened': { timestamp: number },
  'settings.opened': { timestamp: number },
  'notification.shown': {
    type: 'threat' | 'recovery' | 'threshold',
    userAction?: 'click' | 'dismiss'
  },
  'recovery.initiated': {
    snapshotId: string,
    fileCount: number
  }
}
```

### 4.3 System Events
```typescript
{
  'extension.activated': {
    extensionVersion: string,
    vscodeVersion: string,
    timestamp: number
  },

  'extension.deactivated': {
    sessionDuration: number,
    timestamp: number
  },

  'error.occurred': {
    errorType: string,
    errorMessage: string,
    stack?: string,
    context: string
  }
}
```

## 5. Privacy Filtering Rules (PII Scrubbing)

### 5.1 What NOT to Send
❌ File paths containing usernames (e.g., `/Users/john/project`)
❌ Email addresses
❌ API keys or credentials
❌ Git commit messages
❌ Full file contents
❌ IP addresses (PostHog masks automatically)

### 5.2 Privacy Filtering Implementation
```typescript
interface TelemetryCollector {
  // Before sending, filter properties
  private scrubProperties(props: Record<string, any>): Record<string, any> {
    // Remove known PII fields
    const { email, apiKey, password, ...safe } = props;

    // Sanitize file paths
    if (safe.filePath) {
      safe.filePath = this.sanitizePath(safe.filePath);
    }

    return safe;
  }

  private sanitizePath(path: string): string {
    // /Users/john/project/src/auth.ts → ./src/auth.ts
    return path.replace(/^.*\/project\//, './');
  }
}
```

## 6. Feature Flags for SnapBack

### 6.1 Use Cases
```typescript
// A/B test new notification style
if (posthog.isFeatureEnabled('new_notification_ui')) {
  showNewNotificationStyle();
} else {
  showClassicNotificationStyle();
}

// Gradually roll out threat detection
const threatThreshold = posthog.getFeatureFlagPayload('threat_detection_v2')?.threshold ?? 80;

// Beta features
if (posthog.isFeatureEnabled('burst_detection_beta')) {
  enableBurstDetection();
}
```

### 6.2 Feature Flag Properties
```typescript
{
  key: 'new_notification_ui',
  enabled: true,
  payload: { style: 'modern', animation: 'fade' }
}
```

## 7. Integration Architecture for SnapBack

### 7.1 Component Hierarchy
```
TelemetryCollector (singleton)
  ├── PostHog SDK wrapper
  ├── Privacy filter (PII scrubbing)
  ├── Event queue (batching)
  └── Opt-out manager

TelemetryService (convenience layer)
  ├── captureProtectionEvent()
  ├── captureUserInteraction()
  ├── captureSystemEvent()
  └── captureError()

PrivacyProxyAdapter (optional)
  └── Domain routing config
```

### 7.2 Integration Points
```typescript
// Phase 21: NotificationManager
await telemetryCollector.capture('notification.shown', {
  type: notification.type,
  title: notification.title
});

// Phase 20: Dashboard
await telemetryCollector.capture('dashboard.opened');

// Phase 14: AutoDecisionIntegration
await telemetryCollector.capture('threat.detected', decision);

// Phase 16: Snapshot creation
await telemetryCollector.capture('snapshot.created', snapshot);
```

## 8. PostHog SDK Method Reference for Phase 22

### 8.1 Core Methods
```typescript
// Initialize (call once in extension activation)
posthog.init(apiKey, config)

// Capture event
posthog.capture(eventName, properties)

// Identify user
posthog.identify(distinctId, properties)

// Set user properties
posthog.people.set(properties)

// Feature flags
posthog.isFeatureEnabled(flagName)
posthog.getFeatureFlagPayload(flagName)

// Privacy controls
posthog.optOut()
posthog.optIn()
posthog.hasOptedOutCapturing()
```

### 8.2 Advanced Methods
```typescript
// Batch events (automatic)
// PostHog batches every ~1 second by default

// Reload flags (after user change)
posthog.reloadFeatureFlags()

// Reset (logout)
posthog.reset()

// Register (persistent properties)
posthog.register({ plan: 'enterprise' })
```

## 9. TDD Strategy for Phase 22

### RED Phase (Tests First)
1. **TelemetryCollector Tests** (22.1)
   - Event capture with privacy filtering
   - Event batching
   - Opt-out handling
   - Feature flag checks

2. **PrivacyProxy Tests** (22.2)
   - Domain routing configuration
   - Header handling (X-Forwarded-For)
   - PII scrubbing

### GREEN Phase (Implementation)
1. **TelemetryCollector** (22.3)
   - PostHog SDK wrapper
   - Privacy filter implementation
   - Event queue & batching

2. **PrivacyProxyAdapter** (22.4)
   - Configuration builder
   - Domain routing logic

### REFACTOR Phase
- Extract common patterns
- Optimize batching strategy
- Add telemetry hooks to existing components

## 10. SnapBack Telemetry Privacy Statement (Example)

```
We use PostHog for analytics to improve protection quality.
- No personal data (emails, paths, credentials) is collected
- Events are anonymized and tied to workspace, not user
- You can opt out anytime in Settings
- Data is stored in US region (configurable for EU)
- We never sell your data
```

## References

- **PostHog JS SDK**: https://github.com/posthog/posthog-js (583 code snippets)
- **Privacy Proxy Guide**: https://posthog.com/docs/advanced/proxy
- **Feature Flags**: https://posthog.com/docs/feature-flags
- **Session Replay**: https://posthog.com/docs/session-replay
- **Event Filtering**: https://posthog.com/docs/data-privacy

**Next Step**: Begin Phase 22.1 (TelemetryCollector RED tests)
