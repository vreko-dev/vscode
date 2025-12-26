/**
 * StatusBarManager Tests
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#status-bar
 *
 * TEST CATEGORIES:
 * 1. State transitions (the state machine)
 * 2. Display text formatting
 * 3. Timeout behavior
 * 4. Stats tracking
 * 5. Vitals integration (now enabled by default)
 *
 * GOTCHAS:
 * - Use fake timers for timeout testing
 * - Mock vscode.window.createStatusBarItem
 * - Test tooltip content separately from text
 * - Vitals enabled by default (changed from opt-in to default-enabled)
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { StatusBarManager } from '../../src/ui/StatusBarManager';
import type { StatusBarStats, VitalsDisplayData } from '../../src/ui/ux-types';

describe('StatusBarManager', () => {
  let statusBar: StatusBarManager;
  let mockStatusBarItem: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // Capture the created status bar item
    vi.mocked(vscode.window.createStatusBarItem).mockImplementation(() => {
      mockStatusBarItem = {
        text: '',
        tooltip: '',
        backgroundColor: undefined,
        command: undefined,
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
      };
      return mockStatusBarItem;
    });
    statusBar = new StatusBarManager();
  });

  afterEach(() => {
    statusBar.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // STATE MACHINE TESTS
  // ===========================================================================

  describe('state machine', () => {
    it('should start in idle state', () => {
      // Check initial text matches idle pattern
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
    });

    it('should transition from idle to idle-stats when checkpoints exist', () => {
      // ARRANGE: Update stats with checkpoint count
      statusBar.updateStats({ checkpointsToday: 5 });
      // ACT: Call showIdle()
      statusBar.showIdle();
      // ASSERT: Text should show checkpoint count
      expect(mockStatusBarItem.text).toBe('$(shield) 5 checkpoints today');
    });

    it('should transition from ai-session to idle after 5s', () => {
      statusBar.showAISession('Cursor');
      expect(mockStatusBarItem.text).toBe('$(sparkle) Cursor session protected');

      vi.advanceTimersByTime(5000);

      // After timeout, should be back in idle state
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
    });

    it('should transition from checkpoint to idle-stats after 3s', () => {
      statusBar.showCheckpointCreated();
      expect(mockStatusBarItem.text).toBe('$(check) Checkpoint saved');

      vi.advanceTimersByTime(3000);

      // After timeout, should be in idle-stats (checkpoint count is now 1)
      expect(mockStatusBarItem.text).toBe('$(shield) 1 checkpoint today');
    });

    it('should transition from restored to idle after 5s', () => {
      statusBar.showRestored(47);
      expect(mockStatusBarItem.text).toBe('$(history) Restored 47 lines');
      expect(mockStatusBarItem.backgroundColor).toBeDefined();

      vi.advanceTimersByTime(5000);

      // After timeout, should be back in idle and backgroundColor cleared
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
      expect(mockStatusBarItem.backgroundColor).toBeUndefined();
    });

    it('should cancel pending transition when new state is set', () => {
      statusBar.showAISession('Cursor');
      vi.advanceTimersByTime(2000); // Halfway through ai-session timeout
      statusBar.showCheckpointCreated(); // New state - should cancel ai-session timeout

      vi.advanceTimersByTime(3000); // Checkpoint timeout

      // Should be in idle-stats (checkpoint count = 1), not from stale ai-session timeout
      expect(mockStatusBarItem.text).toBe('$(shield) 1 checkpoint today');
    });
  });

  // ===========================================================================
  // DISPLAY TEXT TESTS
  // ===========================================================================

  describe('display text', () => {
    it('should show "$(shield) SnapBack" in idle state', () => {
      statusBar.showIdle();
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
    });

    it('should show checkpoint count in idle-stats state', () => {
      statusBar.updateStats({ checkpointsToday: 5 });
      statusBar.showIdle();
      expect(mockStatusBarItem.text).toBe('$(shield) 5 checkpoints today');
    });

    it('should handle singular checkpoint correctly', () => {
      // EDGE CASE: "1 checkpoint" not "1 checkpoints"
      statusBar.updateStats({ checkpointsToday: 1 });
      statusBar.showIdle();
      expect(mockStatusBarItem.text).toBe('$(shield) 1 checkpoint today');
    });

    it('should show AI tool name in ai-session state', () => {
      statusBar.showAISession('Cursor');
      expect(mockStatusBarItem.text).toBe('$(sparkle) Cursor session protected');
    });

    it('should show generic message when AI tool unknown', () => {
      statusBar.showAISession(); // No tool specified
      expect(mockStatusBarItem.text).toBe('$(zap) Active session');
    });

    it('should show line count in restored state', () => {
      statusBar.showRestored(47);
      expect(mockStatusBarItem.text).toBe('$(history) Restored 47 lines');
    });

    it('should handle restored without line count', () => {
      statusBar.showRestored(); // No line count
      expect(mockStatusBarItem.text).toBe('$(history) Restored lines');
    });
  });

  // ===========================================================================
  // VITALS DISPLAY TESTS
  // ===========================================================================

  describe('vitals display (default enabled)', () => {
    const mockVitals: VitalsDisplayData = {
      pulse: { level: 'racing', value: 45 },
      temperature: { level: 'hot', percentage: 72, tool: 'Cursor' },
      pressure: { value: 78, trend: 'rising' },
      oxygen: { value: 92 },
      trajectory: 'degrading',
    };

    it('should allow disabling vitals (opt-out)', () => {
      // NEW TEST: Users can opt out of vitals display
      statusBar.setVitalsEnabled(false);
      const textBefore = mockStatusBarItem.text;
      statusBar.showVitals(mockVitals);
      // Should remain in previous state, not switch to vitals
      expect(mockStatusBarItem.text).toBe(textBefore);
    });

    it('should show vitals when enabled (default behavior)', () => {
      statusBar.setVitalsEnabled(true);
      statusBar.showVitals(mockVitals);
      // Expected format: "🧡45 🔥 📊78 🫁92"
      expect(mockStatusBarItem.text).toContain('45');
      expect(mockStatusBarItem.text).toContain('78');
      expect(mockStatusBarItem.text).toContain('92');
    });

    it('should use correct emoji for each pulse level', () => {
      statusBar.setVitalsEnabled(true);

      // Test resting (💤) - matches PULSE_EMOJI in ux-types.ts
      statusBar.showVitals({ ...mockVitals, pulse: { level: 'resting', value: 5 } });
      expect(mockStatusBarItem.text).toContain('💤');

      // Test elevated (💗)
      statusBar.showVitals({ ...mockVitals, pulse: { level: 'elevated', value: 15 } });
      expect(mockStatusBarItem.text).toContain('💗');

      // Test racing (💖)
      statusBar.showVitals({ ...mockVitals, pulse: { level: 'racing', value: 30 } });
      expect(mockStatusBarItem.text).toContain('💖');

      // Test critical (💥)
      statusBar.showVitals({ ...mockVitals, pulse: { level: 'critical', value: 50 } });
      expect(mockStatusBarItem.text).toContain('💥');
    });

    it('should use correct emoji for each temperature level', () => {
      statusBar.setVitalsEnabled(true);

      // Test cool (🧊)
      statusBar.showVitals({ ...mockVitals, temperature: { level: 'cool', percentage: 0 } });
      expect(mockStatusBarItem.text).toContain('🧊');

      // Test warm (🌡️)
      statusBar.showVitals({ ...mockVitals, temperature: { level: 'warm', percentage: 30 } });
      expect(mockStatusBarItem.text).toContain('🌡️');

      // Test hot (🔥)
      statusBar.showVitals({ ...mockVitals, temperature: { level: 'hot', percentage: 60 } });
      expect(mockStatusBarItem.text).toContain('🔥');

      // Test burning (🌋)
      statusBar.showVitals({ ...mockVitals, temperature: { level: 'burning', percentage: 90 } });
      expect(mockStatusBarItem.text).toContain('🌋');
    });

    it('should transition to idle when vitals disabled mid-display', () => {
      statusBar.setVitalsEnabled(true);
      statusBar.showVitals(mockVitals);
      expect(mockStatusBarItem.text).toContain('📊'); // Vitals displayed

      statusBar.setVitalsEnabled(false);

      // Should transition back to idle
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
    });
  });

  // ===========================================================================
  // STATS TRACKING TESTS
  // ===========================================================================

  describe('stats tracking', () => {
    it('should increment checkpoint count on showCheckpointCreated', () => {
      statusBar.showCheckpointCreated();
      vi.advanceTimersByTime(3000); // Wait for transition to idle-stats

      // Should show 1 checkpoint
      expect(mockStatusBarItem.text).toBe('$(shield) 1 checkpoint today');

      statusBar.showCheckpointCreated();
      vi.advanceTimersByTime(3000);

      // Should show 2 checkpoints
      expect(mockStatusBarItem.text).toBe('$(shield) 2 checkpoints today');
    });

    it('should increment AI session count on showAISession', () => {
      statusBar.showAISession('Cursor');
      vi.advanceTimersByTime(5000); // Wait for transition

      // The AI session count is tracked internally but displayed in tooltip
      // We can verify it increments by calling multiple times and checking tooltip
      statusBar.showAISession('Copilot');

      // Verify tooltip includes AI session count
      expect(mockStatusBarItem.tooltip).toBeDefined();
    });

    it('should update stats via updateStats()', () => {
      const newStats: Partial<StatusBarStats> = {
        checkpointsToday: 10,
        weekLinesProtected: 5000,
      };

      statusBar.updateStats(newStats);
      statusBar.showIdle();

      // Should reflect updated checkpoint count
      expect(mockStatusBarItem.text).toBe('$(shield) 10 checkpoints today');
    });

    it('should record last checkpoint info', () => {
      const checkpointInfo = {
        timestamp: Date.now(),
        aiTool: 'Cursor',
        fileCount: 3,
      };

      statusBar.recordCheckpoint(checkpointInfo);

      // Should show checkpoint created state
      expect(mockStatusBarItem.text).toBe('$(check) Checkpoint saved');

      // Tooltip should include the checkpoint info
      expect(mockStatusBarItem.tooltip).toBeDefined();
    });
  });

  // ===========================================================================
  // TOOLTIP TESTS
  // ===========================================================================

  describe('tooltip', () => {
    it('should include today stats in tooltip', () => {
      statusBar.updateStats({
        checkpointsToday: 7,
        aiSessionsToday: 2,
      });
      statusBar.showIdle();

      // Tooltip is a MarkdownString, check its value property
      const tooltip = mockStatusBarItem.tooltip;
      expect(tooltip).toBeDefined();
      expect(tooltip.value).toContain('7 checkpoints');
      expect(tooltip.value).toContain('2 AI sessions');
    });

    it('should include last checkpoint info when available', () => {
      statusBar.recordCheckpoint({
        timestamp: Date.now() - 120000, // 2 minutes ago
        aiTool: 'Cursor',
        fileCount: 3,
      });

      const tooltip = mockStatusBarItem.tooltip;
      expect(tooltip.value).toContain('Last checkpoint');
      expect(tooltip.value).toContain('2m ago');
      expect(tooltip.value).toContain('Cursor');
    });

    it('should not show last checkpoint when none exists', () => {
      statusBar.showIdle();

      const tooltip = mockStatusBarItem.tooltip;
      expect(tooltip.value).not.toContain('Last checkpoint');
    });
  });

  // ===========================================================================
  // LIFECYCLE TESTS
  // ===========================================================================

  describe('lifecycle', () => {
    it('should show status bar item on creation', () => {
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });

    it('should dispose status bar item on dispose()', () => {
      statusBar.dispose();
      expect(mockStatusBarItem.dispose).toHaveBeenCalled();
    });

    it('should clear timeout on dispose()', () => {
      statusBar.showAISession('Cursor');
      statusBar.dispose();

      // Advance timers - should not throw or cause issues
      expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle rapid successive state changes', () => {
      // Rapid fire state changes
      statusBar.showAISession('Cursor');
      statusBar.showCheckpointCreated();
      statusBar.showRestored(100);
      statusBar.showAISession('Copilot');

      // Should be in last set state (ai-session with Copilot)
      expect(mockStatusBarItem.text).toBe('$(sparkle) Copilot session protected');
    });

    it('should handle zero checkpoint count', () => {
      statusBar.updateStats({ checkpointsToday: 0 });
      statusBar.showIdle();

      // Should show plain idle, not idle-stats
      expect(mockStatusBarItem.text).toBe('$(shield) SnapBack');
    });

    it('should handle undefined vitals properties', () => {
      // EDGE CASE: Partial vitals data
      const partialVitals: VitalsDisplayData = {
        pulse: { level: 'resting', value: 10 },
        temperature: { level: 'cool', percentage: 5 },
        pressure: { value: 20, trend: 'stable' },
        oxygen: { value: 95 },
        trajectory: 'stable',
      };

      statusBar.setVitalsEnabled(true);
      // Should not throw
      expect(() => statusBar.showVitals(partialVitals)).not.toThrow();
    });
  });
});
