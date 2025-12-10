<!--
Consolidated from:
- ENHANCED_NOTIFICATIONS.md
- NOTIFICATION_INTEGRATION.md
- NOTIFICATION_UPGRADE_SUMMARY.md
Last updated: 2025-10-14
-->

# SnapBack Notifications System

This document describes the enhanced notification system implemented in SnapBack to provide users with more detailed, actionable, and confidence-building alerts.

## Overview

The enhanced notification system builds user trust by showing SnapBack's technical competence and specific risk detection reasoning. Each notification type provides:

1. **Specific Triggers**: Shows exactly what pattern triggered the alert
2. **Technical Competence**: Demonstrates understanding of AI tools, file types, risk factors
3. **Confidence Metrics**: Shows detection confidence percentages
4. **Actionable Information**: Clear next steps and recovery options
5. **SnapBack Branding**: Consistent tone and emoji usage
6. **Progressive Disclosure**: Clean collapsed view, detailed expanded view
7. **Risk Context**: Explains why something is risky, not just that it is risky

## Notification Types

### Risk Detection Alerts

**Collapsed:**

```
🛡️ SnapBack detected potential AI-induced risk
```

**Expanded:**

```
🛡️ SnapBack Risk Analysis - Medium Severity

Detected Patterns:
• Package.json modified (3 dependencies updated)
• TypeScript config changes in 2 files simultaneously
• Change velocity: 47 files/minute (typical AI assistant pattern)
• Dependency cascade risk: High (major version bumps detected)

Files at risk: package.json, tsconfig.json, src/types/*.ts
Last safe checkpoint: 2 minutes ago

[View Details] [Create Manual Checkpoint] [Ignore]
```

### Checkpoint Creation Alerts

**Collapsed:**

```
📸 SnapBack checkpoint secured
```

**Expanded:**

```
📸 Checkpoint Created Successfully

Trigger: AI activity pattern detected (Cursor suggestion accepted)
Protected files: 12 files across 4 directories
Checkpoint ID: snap_20241028_143052
Storage: .snapback/checkpoints/ (encrypted)
Recovery available via: Command palette or sidebar

Your code is now safely backed up. Continue coding fearlessly!
```

### AI Activity Detection

**Collapsed:**

```
🤖 AI coding session detected - Auto-protecting
```

**Expanded:**

```
🤖 AI Assistant Activity Monitored

Detected Tool: GitHub Copilot
Pattern Confidence: 94%
Activity Type: Multi-file refactoring
Files Modified: 8 files in last 30 seconds

Auto-checkpoint: ✅ Created (snap_20241028_143052)
Protection Status: ACTIVE
Safe to accept AI suggestions - recovery ready if needed.
```

### Security/Sensitive File Alerts

**Collapsed:**

```
🔒 Sensitive file modification detected
```

**Expanded:**

```
🔒 Critical File Protection Alert

Modified Files:
• .env.production (environment variables)
• package.json (dependency changes)
• webpack.config.js (build configuration)

Risk Factors:
• Production secrets exposed
• Build pipeline could break
• 3rd party package added: "some-new-library"

Checkpoint: ✅ Auto-created before changes
[Review Changes] [Rollback Now] [Mark Safe]
```

### Large Change Detection

**Collapsed:**

```
📊 Significant codebase changes detected
```

**Expanded:**

```
📊 Large-Scale Change Analysis

Change Scope:
• 47 files modified
• 2,340 lines added/removed
• 8 new dependencies introduced
• 3 configuration files updated

Change Velocity: 156 files/minute (AI assistant pattern detected)
Risk Level: HIGH - Potential cascade failure

Last stable checkpoint: 5 minutes ago
[View Full Diff] [Create Recovery Point] [Continue Monitoring]
```

### Failure Recovery Alerts

**Collapsed:**

```
🚨 Build failure detected - Recovery available
```

**Expanded:**

```
🚨 Build System Failure Detected

Error Source: TypeScript compilation failed
Likely Cause: Recent dependency updates (last 3 minutes)
AI Tool Active: Cursor (confidence: 87%)

Available Recovery Options:
• Rollback to last successful build (2 min ago)
• Selective file recovery (restore package.json only)
• Full workspace restore (snap_20241028_142847)

[Quick Rollback] [Selective Recovery] [View Error Log]
```

### System Status Updates

**Collapsed:**

```
🧢 SnapBack protection status updated
```

**Expanded:**

```
🧢 SnapBack Protection Dashboard

Current Status: ACTIVELY MONITORING
• AI Detection: ✅ Enabled (monitoring Copilot, Cursor, Windsurf)
• Auto-checkpoint: ✅ Every 5 minutes or AI activity
• File watching: ✅ 247 files monitored
• Last checkpoint: 43 seconds ago

Protection Statistics (This Session):
• Checkpoints created: 12
• Risk alerts: 3 (all handled safely)
• Recovery operations: 0 (no disasters yet!)

Your code is fully protected. Code fearlessly! 🛡️
```

## Implementation Details

// TODO: Implement detailed NotificationManager extension methods
// TODO: Add integration points with all subsystems for contextual notifications
// TODO: Implement notification persistence and history

### NotificationManager Extension

The NotificationManager class has been extended with new methods for each notification type:

1. `showEnhancedRiskDetected()`
2. `showEnhancedCheckpointCreated()`
3. `showEnhancedAiActivity()`
4. `showEnhancedSecurityAlert()`
5. `showEnhancedLargeChange()`
6. `showEnhancedFailureRecovery()`
7. `showEnhancedSystemStatus()`

Each method accepts detailed parameters and formats the notification with appropriate icons, messages, and actions.

## Configuration

### Notification Settings

Users can customize notification behavior through VS Code settings:

| Setting                                        | Default | Description                                         |
| ---------------------------------------------- | ------- | --------------------------------------------------- |
| `snapback.notifications.showCheckpointCreated` | `true`  | Show enhanced notifications after snapshot creation |
| `snapback.notifications.duration`              | `3000`  | Duration (ms) to display notifications              |
| `snapback.showAutoCheckpointNotifications`     | `true`  | Toast notifications for Watch-level auto snapshots  |

### Disabling Notifications

To disable specific notification types:

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "snapback"
3. Find the relevant notification setting
4. Toggle off to disable

## Best Practices

### For Users

1. **Review Notifications**: Take time to understand what each notification is telling you
2. **Use Actions**: Notifications provide actionable buttons - use them when appropriate
3. **Customize Settings**: Adjust notification frequency and types to your workflow
4. **Report Issues**: If notifications seem incorrect or confusing, report them

### For Developers

1. **Consistent Branding**: Use consistent emojis and terminology
2. **Actionable Content**: Always provide clear next steps
3. **Confidence Metrics**: Include confidence percentages when available
4. **Progressive Disclosure**: Keep collapsed views clean, detailed views informative
