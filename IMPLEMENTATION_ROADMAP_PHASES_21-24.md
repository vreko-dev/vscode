# SnapBack Implementation Roadmap - Phases 21-24

## Overview

This roadmap details the final 4 phases to complete SnapBack VS Code extension. All phases follow TDD (Test-Driven Development):
1. **RED**: Write comprehensive tests
2. **GREEN**: Implement minimum code to pass tests
3. **REFACTOR**: Optimize using library patterns

---

## Phase 21: Notifications & Threat Alerts

### Purpose
Deliver real-time threat notifications to users based on risk score and engine decisions.

### Test Suite (30+ tests)

#### File: `test/unit/notifications/notificationManager.test.ts`

**Tests to write (TDD RED phase):**

1. **Notification Types** (5 tests)
   - Test creating threat notification
   - Test creating recovery notification
   - Test creating threshold breach notification
   - Test creating protection success notification
   - Test custom notification with metadata

2. **Notification Display** (5 tests)
   - Test showMessage (info level)
   - Test showWarning (warning level)
   - Test showError (error level)
   - Test message formatting
   - Test icon/emoji rendering

3. **User Actions** (5 tests)
   - Test notification with actions (e.g., "Dismiss", "Review Risk")
   - Test action callback execution
   - Test dismissing notification
   - Test "Don't show again" functionality
   - Test action parameters passing

4. **Throttling/Deduplication** (5 tests)
   - Test preventing duplicate notifications (same threat)
   - Test throttling rapid notifications (max 1 per 30s)
   - Test clearing old notifications
   - Test priority handling (critical > warning > info)
   - Test notification stacking

5. **Integration with Engine** (5 tests)
   - Test notification triggered on risk threshold breach
   - Test recovery notification on risk drop
   - Test burst detection notification
   - Test critical file notification
   - Test engine state updates trigger notifications

6. **Persistence** (5 tests)
   - Test notification history saved
   - Test retrieve notification log
   - Test clear notification history
   - Test notification context captured (file, risk score)
   - Test export notification events for telemetry

### Implementation (GREEN phase)

**File: `src/notifications/notificationManager.ts` (200-250 lines)**

```typescript
interface NotificationConfig {
  id: string;
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  actions?: Array<{ label: string; action: () => void }>;
  durationMs?: number;  // Auto-dismiss after N ms
}

class NotificationManager {
  private notificationHistory: NotificationConfig[] = [];
  private lastNotificationTime: Map<string, number> = new Map();
  private THROTTLE_MS = 30000;  // Max 1 notification per 30s per type

  async show(config: NotificationConfig): Promise<void> {
    // Check throttle
    if (this.isThrottled(config.id)) {
      return;
    }

    // Log to history
    this.notificationHistory.push(config);

    // Show to user
    const result = await this.showVsCodeMessage(config);

    // Handle action
    if (result && config.actions) {
      const action = config.actions[result];
      action?.action();
    }

    // Update throttle time
    this.lastNotificationTime.set(config.id, Date.now());
  }

  private isThrottled(id: string): boolean {
    const last = this.lastNotificationTime.get(id);
    if (!last) return false;
    return Date.now() - last < this.THROTTLE_MS;
  }

  private async showVsCodeMessage(config: NotificationConfig): Promise<number | undefined> {
    const actions = config.actions?.map(a => a.label) || [];

    if (config.type === 'error') {
      return await vscode.window.showErrorMessage(config.message, ...actions);
    } else if (config.type === 'warning') {
      return await vscode.window.showWarningMessage(config.message, ...actions);
    } else {
      return await vscode.window.showInformationMessage(config.message, ...actions);
    }
  }

  getHistory(): NotificationConfig[] {
    return [...this.notificationHistory];
  }

  clearHistory(): void {
    this.notificationHistory = [];
  }
}
```

### Commands Added
- `snapback.dismissNotification` - Dismiss active notification
- `snapback.viewNotificationHistory` - Show notification log
- `snapback.clearNotifications` - Clear notification history

### Status Bar Integration
- Add notification bell icon when active threats

---

## Phase 22: Team Collaboration & Sharing

### Purpose
Enable teams to share protection policies and snapshot contexts across team members.

### Test Suite (25+ tests)

#### File: `test/unit/collaboration/teamSharing.test.ts`

**Tests to write (TDD RED phase):**

1. **Policy Sharing** (5 tests)
   - Test exporting protection policy as shareable config
   - Test importing policy from team member
   - Test policy validation (version compatibility)
   - Test policy diff (what changed)
   - Test policy merge (local + shared)

2. **Snapshot Sharing** (5 tests)
   - Test generating shareable snapshot link
   - Test snapshot encryption for sharing
   - Test snapshot metadata export (without file contents)
   - Test snapshot import from link
   - Test snapshot context preservation

3. **Team Workspace** (5 tests)
   - Test setting team workspace folder
   - Test detecting shared protection policies
   - Test syncing team settings locally
   - Test notifying team of critical issues
   - Test team member presence (who's working now)

4. **Audit Trail** (5 tests)
   - Test logging snapshot creation with user info
   - Test logging policy changes
   - Test audit log retrieval
   - Test audit log export
   - Test audit log cleanup (retention policy)

5. **Permissions** (5 tests)
   - Test read-only mode for guest users
   - Test admin override for critical settings
   - Test user role validation
   - Test permission inheritance
   - Test granular permissions (per-file, per-feature)

### Implementation (GREEN phase)

**File: `src/collaboration/teamSharing.ts` (180-220 lines)**

```typescript
interface TeamPolicy {
  id: string;
  name: string;
  riskThreshold: number;
  protectedPatterns: string[];
  createdBy: string;
  createdAt: number;
  version: string;
}

class TeamCollaborationManager {
  async sharePolicy(policy: AutoDecisionConfig): Promise<string> {
    // Serialize policy
    const serialized = JSON.stringify(policy);

    // Create shareable token/link
    const token = await this.generateShareToken(serialized);

    return token;
  }

  async importPolicy(token: string): Promise<TeamPolicy> {
    // Validate and decrypt token
    const policy = await this.validateShareToken(token);

    // Validate compatibility
    this.validatePolicyVersion(policy);

    return policy;
  }

  async logAuditEvent(event: AuditEvent): Promise<void> {
    const logged = {
      ...event,
      timestamp: Date.now(),
      user: await this.getCurrentUser()
    };

    // Store in workspace state
    const history = await this.getAuditHistory();
    history.push(logged);
    await this.saveAuditHistory(history);
  }
}
```

### Commands Added
- `snapback.sharePolicy` - Export policy for team
- `snapback.importPolicy` - Import team policy
- `snapback.viewAuditLog` - View activity history
- `snapback.inviteTeamMember` - Invite to workspace

---

## Phase 23: Analytics & Insights

### Purpose
Collect anonymized telemetry and provide actionable insights about protection patterns.

### Test Suite (28+ tests)

#### File: `test/unit/analytics/telemetryCollector.test.ts`

**Tests to write (TDD RED phase):**

1. **Event Collection** (5 tests)
   - Test collecting snapshot creation events
   - Test collecting risk score changes
   - Test collecting notification events
   - Test collecting restore events
   - Test collecting configuration changes

2. **Aggregation** (5 tests)
   - Test daily stats (snapshots/day, avg risk)
   - Test weekly trends (protection improvement)
   - Test threat patterns (most common risks)
   - Test time-of-day patterns
   - Test file type patterns

3. **Privacy & Anonymization** (5 tests)
   - Test removing file paths
   - Test removing user identifiers
   - Test removing workspace info
   - Test opt-out handling
   - Test data retention policies

4. **Insights Generation** (5 tests)
   - Test identifying risky patterns
   - Test recommending threshold adjustments
   - Test suggesting protected file patterns
   - Test detecting unusual activity
   - Test performance bottleneck detection

5. **Dashboard & Reports** (4 tests)
   - Test telemetry visualization
   - Test weekly summary generation
   - Test exporting analytics report
   - Test sharing insights with team

6. **Compliance** (4 tests)
   - Test GDPR compliance (right to be forgotten)
   - Test data encryption in transit
   - Test audit trail for data collection
   - Test user consent tracking

### Implementation (GREEN phase)

**File: `src/analytics/telemetryCollector.ts` (200-250 lines)**

```typescript
interface TelemetryEvent {
  eventType: 'snapshot.created' | 'risk.changed' | 'restore.executed';
  timestamp: number;
  // No PII - everything anonymized
  snapshotCount?: number;
  riskScore?: number;
  duration?: number;
}

class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private optedOut = false;

  async recordEvent(event: Omit<TelemetryEvent, 'timestamp'>): Promise<void> {
    if (this.optedOut) return;

    // Anonymize
    const anonymized = this.anonymizeEvent(event);

    // Store locally
    this.events.push(anonymized);

    // Batch upload
    if (this.events.length >= 100) {
      await this.uploadEvents();
    }
  }

  async generateInsights(): Promise<Insights> {
    const dailyStats = this.aggregateDailyStats();
    const trends = this.calculateTrends();
    const recommendations = this.generateRecommendations(trends);

    return { dailyStats, trends, recommendations };
  }

  private anonymizeEvent(event: TelemetryEvent): TelemetryEvent {
    // Remove all PII
    return {
      eventType: event.eventType,
      timestamp: Date.now(),
      snapshotCount: event.snapshotCount,
      riskScore: event.riskScore
    };
  }
}
```

### Analytics Views
- `snapback.analytics` - Main analytics dashboard
- `snapback.weeklyReport` - Weekly insights report
- `snapback.threatPatterns` - Common threat patterns

---

## Phase 24: Extension Hardening & Optimization

### Purpose
Final polish: error handling, performance optimization, security hardening, documentation.

### Test Suite (35+ tests)

#### File: `test/unit/hardening/errorHandling.test.ts`, `test/unit/hardening/performance.test.ts`

**Tests to write (TDD RED phase):**

1. **Error Recovery** (8 tests)
   - Test graceful handling of file read failures
   - Test recovery from corrupted snapshot data
   - Test handling extension activation failures
   - Test WebView crash recovery
   - Test storage layer failures
   - Test network timeout handling
   - Test permission denied handling
   - Test out-of-memory handling

2. **Performance** (8 tests)
   - Test snapshot creation time (<500ms)
   - Test decision making time (<100ms)
   - Test WebView rendering time (<1s)
   - Test memory usage (< 50MB baseline)
   - Test file watcher performance with 10k+ files
   - Test batch processing efficiency
   - Test storage cleanup performance
   - Test index lookup performance

3. **Security** (8 tests)
   - Test input validation (file paths, user input)
   - Test command injection prevention
   - Test XSS prevention in WebView
   - Test CSRF protection
   - Test secret storage (no plaintext)
   - Test access control (file permissions)
   - Test state isolation (workspace-specific)
   - Test malicious snapshot handling

4. **Resource Management** (6 tests)
   - Test proper disposal of event listeners
   - Test file watcher cleanup
   - Test WebView memory cleanup
   - Test database connection cleanup
   - Test background task cancellation
   - Test storage limit enforcement

5. **Reliability** (5 tests)
   - Test extension survives 1000 file saves
   - Test extension survives 100 reloads
   - Test snapshot integrity after corruption
   - Test graceful degradation
   - Test feature flag fallbacks

### Implementation (GREEN phase)

**File: `src/hardening/errorHandler.ts` (150-200 lines)**

```typescript
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

class ErrorHandler {
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    fallback: T,
    context: string
  ): Promise<Result<T>> {
    try {
      const value = await operation();
      return { success: true, value };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      logger.error(`Operation failed: ${context}`, {
        error: err.message,
        stack: err.stack
      });

      // Attempt recovery
      try {
        const recovered = await this.attemptRecovery(context, err);
        return { success: true, value: recovered as T };
      } catch (recoveryError) {
        return {
          success: false,
          error: recoveryError instanceof Error ? recoveryError : err
        };
      }
    }
  }

  private async attemptRecovery(context: string, error: Error): Promise<any> {
    if (context.includes('snapshot') && error.message.includes('corrupted')) {
      // Rebuild snapshot index
      return await snapshotOrchestrator.rebuildIndex();
    }
    throw error;
  }
}
```

**File: `src/hardening/performance.ts` (120-150 lines)**

```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  measure<T>(
    operation: () => T,
    label: string
  ): T {
    const start = performance.now();
    const result = operation();
    const duration = performance.now() - start;

    // Track metric
    if (!this.metrics.has(label)) {
      this.metrics.set(label, []);
    }
    this.metrics.get(label)?.push(duration);

    // Alert if slow
    if (duration > this.getThreshold(label)) {
      logger.warn(`Slow operation: ${label} took ${duration}ms`);
    }

    return result;
  }

  getStats(label: string): { avg: number; max: number; p95: number } {
    const values = this.metrics.get(label) || [];
    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      p95: this.percentile(values, 0.95)
    };
  }

  private getThreshold(label: string): number {
    const thresholds: Record<string, number> = {
      'decision.evaluate': 100,
      'snapshot.create': 500,
      'file.read': 200
    };
    return thresholds[label] || 1000;
  }
}
```

### Quality Checklist
- [ ] All errors logged with context
- [ ] No unhandled promise rejections
- [ ] All async operations timeout-protected
- [ ] File handles properly closed
- [ ] Memory leaks tested
- [ ] Security scan passed
- [ ] Performance benchmarks met
- [ ] TypeScript strict mode
- [ ] 100% test coverage on critical paths

---

## Summary: Tests → Implementation

### Phase 21 (Notifications)
- 30 tests covering notification lifecycle, throttling, engine integration
- 200-250 LOC implementation
- Integration with engine.onDecision events
- StatusBar + user-facing alerts

### Phase 22 (Collaboration)
- 25 tests covering policy sharing, audit trails, permissions
- 180-220 LOC implementation
- Team workspace support
- Shareable tokens and policies

### Phase 23 (Analytics)
- 28 tests covering telemetry, aggregation, insights, privacy
- 200-250 LOC implementation
- Anonymized event tracking
- Weekly reports and recommendations

### Phase 24 (Hardening)
- 35 tests covering error recovery, performance, security, reliability
- 270-350 LOC implementation
- Error recovery strategies
- Performance monitoring and optimization

---

## Total Coverage

**Tests**: 118 tests across 4 phases
**Implementation**: ~850-1050 lines of production code
**Integration Points**:
- Phase 21: Decision engine → Notifications
- Phase 22: Policies + audit trail
- Phase 23: Event aggregation → Insights
- Phase 24: Error handling + performance monitoring

**Time Estimate**:
- Phase 21: 4-5 days
- Phase 22: 3-4 days
- Phase 23: 4-5 days
- Phase 24: 3-4 days
- **Total: 2-3 weeks**

---

## TDD Workflow for Each Phase

1. **Monday**: Write all tests (RED phase)
   - Read requirements
   - Design test structure
   - Write 30-35 comprehensive tests
   - All tests fail

2. **Tuesday-Wednesday**: Implement code (GREEN phase)
   - Write minimum code to pass tests
   - Integrate with existing components
   - Run test suite
   - Fix failures

3. **Thursday**: Refactor & optimize (REFACTOR phase)
   - Review code quality
   - Apply library patterns
   - Performance tuning
   - Documentation

4. **Friday**: Integration testing + review
   - Test with real extension load
   - Cross-component verification
   - Edge case testing
   - Code review

---

## Library Integration Focus

All implementations leverage these VS Code API patterns:

- **Phase 21**: `vscode.window.show*Message()` + `vscode.EventEmitter`
- **Phase 22**: `context.globalState` + `context.workspaceState` + Event subscriptions
- **Phase 23**: `vscode.workspace.onDidChangeConfiguration` for event tracking
- **Phase 24**: Error handling patterns + `context.subscriptions` for cleanup

Reference: `LIBRARY_INTEGRATION_GUIDE.md` for all patterns.
