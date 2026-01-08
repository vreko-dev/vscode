import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { StatusBarStateMachine } from "@vscode/ui/statusBar/StatusBarStateMachine";
import type { StatusBarState } from "@vscode/ui/statusBar/types";

describe("StatusBarStateMachine", () => {
  let machine: StatusBarStateMachine;

  beforeEach(() => {
    machine = new StatusBarStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    machine.dispose();
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════════════
  // INITIAL STATE
  // ═══════════════════════════════════════════════════════════════════

  describe("initial state", () => {
    it("should start in idle state by default", () => {
      // Arrange: fresh machine
      // Act: check state
      // Assert
      expect(machine.getState()).toBe("idle");
    });

    it("should accept custom initial state", () => {
      // Arrange
      const customMachine = new StatusBarStateMachine("disabled");

      // Act & Assert
      expect(customMachine.getState()).toBe("disabled");
      customMachine.dispose();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // BASIC TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("basic transitions", () => {
    it("should transition from idle to ambient-risk", () => {
      // Arrange: machine in idle
      expect(machine.getState()).toBe("idle");

      // Act
      const result = machine.transition("ambient-risk", "risk-detected");

      // Assert
      expect(result).toBe(true);
      expect(machine.getState()).toBe("ambient-risk");
    });

    it("should transition from idle to recommend", () => {
      // Arrange
      expect(machine.getState()).toBe("idle");

      // Act
      const result = machine.transition("recommend", "risk-elevated");

      // Assert
      expect(result).toBe(true);
      expect(machine.getState()).toBe("recommend");
    });

    it("should transition from idle to critical", () => {
      // Arrange
      expect(machine.getState()).toBe("idle");

      // Act
      const result = machine.transition("critical", "high-risk");

      // Assert
      expect(result).toBe(true);
      expect(machine.getState()).toBe("critical");
    });

    it("should transition from any state to protected", () => {
      // Arrange
      machine.transition("critical", "test");

      // Act
      const result = machine.transition("protected", "snapshot-created");

      // Assert
      expect(result).toBe(true);
      expect(machine.getState()).toBe("protected");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // PRIORITY-BASED TRANSITIONS
  // ═══════════════════════════════════════════════════════════════════

  describe("priority-based transitions", () => {
    // Priority order: idle(1) < ambient-risk(2) < recommend(3) < critical(4)

    it("should allow higher priority to interrupt lower priority", () => {
      // Arrange: machine in ambient-risk (priority 2)
      machine.transition("ambient-risk", "initial");
      expect(machine.getState()).toBe("ambient-risk");

      // Act: try to transition to critical (priority 4)
      const result = machine.transition("critical", "high-risk");

      // Assert: should succeed
      expect(result).toBe(true);
      expect(machine.getState()).toBe("critical");
    });

    it("should block lower priority from interrupting higher priority", () => {
      // Arrange: machine in critical (priority 4)
      machine.transition("critical", "initial");
      expect(machine.getState()).toBe("critical");

      // Act: try to transition to ambient-risk (priority 2)
      const result = machine.transition("ambient-risk", "risk-decreased");

      // Assert: should fail, state unchanged
      expect(result).toBe(false);
      expect(machine.getState()).toBe("critical");
    });

    it("should block idle from interrupting any risk state", () => {
      // Arrange: machine in recommend (priority 3)
      machine.transition("recommend", "initial");

      // Act: try to transition to idle (priority 1)
      const result = machine.transition("idle", "user-request");

      // Assert: should fail
      expect(result).toBe(false);
      expect(machine.getState()).toBe("recommend");
    });

    it("should allow same priority transitions", () => {
      // Arrange: machine in recommend
      machine.transition("recommend", "initial");

      // Act: transition to recommend again (same level)
      const result = machine.transition("recommend", "updated-reason");

      // Assert: should succeed
      expect(result).toBe(true);
      expect(machine.getState()).toBe("recommend");
    });

    it("should allow protected state to interrupt any priority", () => {
      // Arrange: machine in critical (highest risk priority)
      machine.transition("critical", "initial");

      // Act: transition to protected (special state)
      const result = machine.transition("protected", "snapshot-created");

      // Assert: should succeed
      expect(result).toBe(true);
      expect(machine.getState()).toBe("protected");
    });

    it("should allow error state to interrupt any priority", () => {
      // Arrange: machine in critical
      machine.transition("critical", "initial");

      // Act: transition to error
      const result = machine.transition("error", "system-failure");

      // Assert: should succeed
      expect(result).toBe(true);
      expect(machine.getState()).toBe("error");
    });

    it("should allow disabled state to interrupt any priority", () => {
      // Arrange: machine in critical
      machine.transition("critical", "initial");

      // Act: transition to disabled
      const result = machine.transition("disabled", "user-disabled");

      // Assert: should succeed
      expect(result).toBe(true);
      expect(machine.getState()).toBe("disabled");
    });

    it("should allow transition from protected back to risk states", () => {
      // Arrange: machine in protected
      machine.transition("protected", "initial");

      // Act: transition to ambient-risk
      const result = machine.transition("ambient-risk", "new-risk");

      // Assert: should succeed (protected doesn't block)
      expect(result).toBe(true);
      expect(machine.getState()).toBe("ambient-risk");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-REVERT BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════

  describe("auto-revert behavior", () => {
    const DEFAULT_REVERT_TIMEOUT = 3000; // 3 seconds

    it("should auto-revert protected state to previous state after timeout", () => {
      // Arrange: machine in ambient-risk
      machine.transition("ambient-risk", "initial");
      expect(machine.getState()).toBe("ambient-risk");

      // Act: transition to protected
      machine.transition("protected", "snapshot-created");
      expect(machine.getState()).toBe("protected");

      // Fast-forward time
      vi.advanceTimersByTime(DEFAULT_REVERT_TIMEOUT);

      // Assert: should revert to ambient-risk
      expect(machine.getState()).toBe("ambient-risk");
    });

    it("should auto-revert protected to idle if previous state was idle", () => {
      // Arrange: machine starts in idle
      expect(machine.getState()).toBe("idle");

      // Act: transition to protected
      machine.transition("protected", "snapshot-created");
      expect(machine.getState()).toBe("protected");

      // Fast-forward time
      vi.advanceTimersByTime(DEFAULT_REVERT_TIMEOUT);

      // Assert: should revert to idle
      expect(machine.getState()).toBe("idle");
    });

    it("should cancel auto-revert when new transition occurs", () => {
      // Arrange: machine in protected with pending revert
      machine.transition("ambient-risk", "initial");
      machine.transition("protected", "snapshot-created");
      expect(machine.getState()).toBe("protected");

      // Act: new transition before timeout
      machine.transition("critical", "new-risk");
      expect(machine.getState()).toBe("critical");

      // Fast-forward past original timeout
      vi.advanceTimersByTime(DEFAULT_REVERT_TIMEOUT);

      // Assert: should remain in critical, not revert
      expect(machine.getState()).toBe("critical");
    });

    it("should allow configurable revert timeout", () => {
      // Arrange: custom machine with 1 second timeout
      const customMachine = new StatusBarStateMachine("idle", { revertTimeout: 1000 });
      customMachine.transition("protected", "snapshot-created");

      // Act: advance less than custom timeout
      vi.advanceTimersByTime(500);
      expect(customMachine.getState()).toBe("protected");

      // Advance past custom timeout
      vi.advanceTimersByTime(600);

      // Assert: should have reverted
      expect(customMachine.getState()).toBe("idle");
      customMachine.dispose();
    });

    it("should clean up timer on dispose", () => {
      // Arrange: machine in protected with pending revert
      machine.transition("ambient-risk", "initial");
      machine.transition("protected", "snapshot-created");

      // Act: dispose before timeout
      machine.dispose();

      // Fast-forward time
      vi.advanceTimersByTime(DEFAULT_REVERT_TIMEOUT);

      // Assert: state should remain protected (timer was cleared)
      expect(machine.getState()).toBe("protected");
    });

    it("should emit state change event on auto-revert", () => {
      // Arrange
      const onStateChange = vi.fn();
      machine.onStateChange(onStateChange);

      machine.transition("ambient-risk", "initial");
      machine.transition("protected", "snapshot-created");
      onStateChange.mockClear();

      // Act: trigger auto-revert
      vi.advanceTimersByTime(DEFAULT_REVERT_TIMEOUT);

      // Assert: should have emitted state change
      expect(onStateChange).toHaveBeenCalledWith("ambient-risk", "protected");
    });
  });
});
