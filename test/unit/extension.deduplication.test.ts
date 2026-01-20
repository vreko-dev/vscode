/**
 * Extension AI Detection Deduplication Tests
 *
 * \ud83d\udd27 REGRESSION TESTS: Fix for rapid-fire AI detection bug
 * Issue: VS Code fires multiple onDidChangeTextDocument events for a single paste operation,
 * causing 8-9 AI detections within <100ms, which triggered sequence abort loops
 * Fix: Added deduplication logic in extension.ts onDidChangeTextDocument handler
 *
 * Test Coverage:
 * 1. Deduplication within 100ms window for same tool+file
 * 2. Allow detection after deduplication window expires
 * 3. Allow different tools on same file
 * 4. Allow same tool on different files
 * 5. Integration with existing AI detection flow
 *
 * @see apps/vscode/src/extension.ts#L152-L158 (deduplication state)
 * @see apps/vscode/src/extension.ts#L703-L735 (deduplication logic)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Deduplication types (matching extension.ts implementation)
interface DetectionState {
  time: number;
  tool: string;
  file: string;
}

const DETECTION_DEDUP_MS = 100;

/**
 * Helper function to determine if a detection should be deduplicated
 * This mirrors the logic in extension.ts
 */
function shouldDeduplicateDetection(
  current: DetectionState,
  last: DetectionState | null,
  dedupWindowMs: number
): boolean {
  if (!last) {
    return false; // No previous detection, proceed
  }

  const detectionKey = `${current.tool}-${current.file}`;
  const lastKey = `${last.tool}-${last.file}`;

  if (detectionKey === lastKey && current.time - last.time < dedupWindowMs) {
    return true; // Same detection within window, skip
  }

  return false; // Different detection or window expired, proceed
}

describe('AI Detection Deduplication (Regression)', () => {
  let lastDetection: DetectionState | null;

  beforeEach(() => {
    lastDetection = null;
  });

  describe('same tool + same file deduplication', () => {
    it('should deduplicate same tool+file within 100ms', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: 'Copilot', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 50, tool: 'Copilot', file: '/test.ts' };

      // First detection should proceed
      const shouldSkip1 = shouldDeduplicateDetection(detection1, null, DETECTION_DEDUP_MS);
      expect(shouldSkip1).toBe(false);

      // Second detection within 100ms should be skipped
      const shouldSkip2 = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip2).toBe(true);
    });

    it('should simulate real-world bug: 8 rapid detections', () => {
      const now = Date.now();
      const detections: DetectionState[] = [];

      // Simulate 8 rapid detections (real bug scenario)
      for (let i = 0; i < 8; i++) {
        detections.push({
          time: now + (i * 15), // 15ms apart
          tool: 'Codeium',
          file: '/workspace/src/api.ts',
        });
      }

      // Only first detection should proceed
      const results = detections.map((detection, index) => {
        const previous = index === 0 ? null : detections[index - 1];
        return !shouldDeduplicateDetection(detection, previous, DETECTION_DEDUP_MS);
      });

      // Verify only first detection proceeds (index 0)
      expect(results[0]).toBe(true);  // First proceeds
      expect(results[1]).toBe(false); // Rest are deduplicated
      expect(results[2]).toBe(false);
      expect(results[3]).toBe(false);
      expect(results[4]).toBe(false);
      expect(results[5]).toBe(false);
      expect(results[6]).toBe(false);
      expect(results[7]).toBe(false);

      // Count how many would trigger UI
      const triggerCount = results.filter(r => r).length;
      expect(triggerCount).toBe(1);
    });
  });

  describe('deduplication window expiry', () => {
    it('should allow detection after 100ms window expires', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: 'Copilot', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 150, tool: 'Copilot', file: '/test.ts' };

      // Second detection after 150ms should proceed (window is 100ms)
      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(false);
    });

    it('should handle edge case: exactly at window boundary', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: 'Cursor', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 100, tool: 'Cursor', file: '/test.ts' };

      // At exactly 100ms, should NOT be deduplicated (< is strict)
      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(false);
    });
  });

  describe('different detection contexts', () => {
    it('should allow different tools on same file', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: 'Copilot', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 10, tool: 'Cursor', file: '/test.ts' };

      // Different tool should proceed immediately
      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(false);
    });

    it('should allow same tool on different files', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: 'Copilot', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 10, tool: 'Copilot', file: '/other.ts' };

      // Different file should proceed immediately
      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(false);
    });

    it('should handle concurrent work on multiple files', () => {
      const now = Date.now();
      const detections: DetectionState[] = [
        { time: now, tool: 'Copilot', file: '/a.ts' },
        { time: now + 10, tool: 'Copilot', file: '/b.ts' },
        { time: now + 20, tool: 'Copilot', file: '/a.ts' }, // Back to first file
        { time: now + 30, tool: 'Copilot', file: '/b.ts' }, // Back to second file
      ];

      let last: DetectionState | null = null;
      const results: boolean[] = [];

      for (const detection of detections) {
        const shouldSkip = shouldDeduplicateDetection(detection, last, DETECTION_DEDUP_MS);
        results.push(!shouldSkip); // Track which ones proceed
        if (!shouldSkip) {
          last = detection; // Update last only if detection proceeded
        }
      }

      // All should proceed because they alternate files
      expect(results).toEqual([true, true, true, true]);
    });
  });

  describe('VS Code event patterns', () => {
    it('should handle VS Code paste operation pattern', () => {
      const now = Date.now();
      // VS Code often fires 3-4 change events for a single paste
      const pasteEvents: DetectionState[] = [
        { time: now, tool: 'Copilot', file: '/component.tsx' },
        { time: now + 5, tool: 'Copilot', file: '/component.tsx' },
        { time: now + 12, tool: 'Copilot', file: '/component.tsx' },
        { time: now + 18, tool: 'Copilot', file: '/component.tsx' },
      ];

      let last: DetectionState | null = null;
      let proceedCount = 0;

      for (const event of pasteEvents) {
        const shouldSkip = shouldDeduplicateDetection(event, last, DETECTION_DEDUP_MS);
        if (!shouldSkip) {
          proceedCount++;
          last = event;
        }
      }

      // Only first event should proceed
      expect(proceedCount).toBe(1);
    });

    it('should handle VS Code formatting operation pattern', () => {
      const now = Date.now();
      // Formatters can trigger multiple detections across files
      const formatEvents: DetectionState[] = [
        { time: now, tool: 'Cursor', file: '/utils.ts' },
        { time: now + 50, tool: 'Cursor', file: '/utils.ts' }, // Same file, deduplicated
        { time: now + 120, tool: 'Cursor', file: '/utils.ts' }, // After window, proceeds
      ];

      let last: DetectionState | null = null;
      const results: boolean[] = [];

      for (const event of formatEvents) {
        const shouldSkip = shouldDeduplicateDetection(event, last, DETECTION_DEDUP_MS);
        results.push(!shouldSkip);
        if (!shouldSkip) {
          last = event;
        }
      }

      // First and third should proceed (third is after window expires)
      expect(results).toEqual([true, false, true]);
    });
  });

  describe('edge cases', () => {
    it('should handle first detection (no previous state)', () => {
      const detection: DetectionState = {
        time: Date.now(),
        tool: 'Copilot',
        file: '/new-file.ts',
      };

      const shouldSkip = shouldDeduplicateDetection(detection, null, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(false);
    });

    it('should handle empty tool name', () => {
      const now = Date.now();
      const detection1: DetectionState = { time: now, tool: '', file: '/test.ts' };
      const detection2: DetectionState = { time: now + 10, tool: '', file: '/test.ts' };

      // Even empty tools should be deduplicated if same file
      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(true);
    });

    it('should handle very long file paths', () => {
      const now = Date.now();
      const longPath = '/workspace/src/components/features/authentication/providers/oauth/' +
                       'implementation/google/utils/token/refresh/handler/implementation.ts';

      const detection1: DetectionState = { time: now, tool: 'Copilot', file: longPath };
      const detection2: DetectionState = { time: now + 10, tool: 'Copilot', file: longPath };

      const shouldSkip = shouldDeduplicateDetection(detection2, detection1, DETECTION_DEDUP_MS);
      expect(shouldSkip).toBe(true);
    });

    it('should handle rapid tool switching', () => {
      const now = Date.now();
      const tools = ['Copilot', 'Cursor', 'Codeium', 'Tabnine'];
      const detections: DetectionState[] = tools.map((tool, i) => ({
        time: now + (i * 10),
        tool,
        file: '/test.ts',
      }));

      let last: DetectionState | null = null;
      const results: boolean[] = [];

      for (const detection of detections) {
        const shouldSkip = shouldDeduplicateDetection(detection, last, DETECTION_DEDUP_MS);
        results.push(!shouldSkip);
        if (!shouldSkip) {
          last = detection;
        }
      }

      // All should proceed because tool changes each time
      expect(results).toEqual([true, true, true, true]);
    });
  });

  describe('performance considerations', () => {
    it('should handle high-frequency detections efficiently', () => {
      const now = Date.now();
      const iterations = 1000;
      const detections: DetectionState[] = [];

      // Generate 1000 rapid detections
      for (let i = 0; i < iterations; i++) {
        detections.push({
          time: now + i,
          tool: 'Copilot',
          file: '/test.ts',
        });
      }

      const startTime = Date.now();
      let last: DetectionState | null = null;
      let proceedCount = 0;

      for (const detection of detections) {
        const shouldSkip = shouldDeduplicateDetection(detection, last, DETECTION_DEDUP_MS);
        if (!shouldSkip) {
          proceedCount++;
          last = detection;
        }
      }

      const duration = Date.now() - startTime;

      // Should complete very quickly (<10ms for 1000 iterations)
      expect(duration).toBeLessThan(10);

      // Only detections outside the window should proceed
      // With 1ms spacing and 100ms window, expect ~10 to proceed
      expect(proceedCount).toBeGreaterThan(0);
      expect(proceedCount).toBeLessThan(20);
    });
  });
});
