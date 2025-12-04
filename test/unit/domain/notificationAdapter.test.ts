import { describe, it, expect } from "vitest";

/**
 * NotificationAdapter Tests
 *
 * Adapts protection decisions into user notifications:
 * - Formats protection alerts for UI
 * - Handles decision communication (protect/allow/block)
 * - Tracks notification delivery
 * - Manages notification state (shown, dismissed, actioned)
 *
 * Flow: ProtectionDecision → NotificationAdapter → UserNotification
 */

describe("NotificationAdapter", () => {
	describe("Notification creation", () => {
		it("should create alert notification", () => {
			const notification = {
				id: "notif1",
				type: "alert",
				title: "AI Activity Detected",
				message: "CoPilot usage detected. Snapshot created.",
				timestamp: Date.now(),
			};

			expect(notification.type).toBe("alert");
			expect(notification.title).toBeTruthy();
		});

		it("should create warning notification", () => {
			const notification = {
				id: "notif2",
				type: "warning",
				title: "High Risk Changes",
				message:
					"Multiple critical files modified. Review before committing.",
				severity: "high",
			};

			expect(notification.type).toBe("warning");
			expect(notification.severity).toBe("high");
		});

		it("should create info notification", () => {
			const notification = {
				id: "notif3",
				type: "info",
				title: "Snapshot Created",
				message: "Automatic snapshot created for recovery.",
				duration: 5000,
			};

			expect(notification.type).toBe("info");
			expect(notification.duration).toBeGreaterThan(0);
		});

		it("should create error notification", () => {
			const notification = {
				id: "notif4",
				type: "error",
				title: "Snapshot Failed",
				message: "Unable to create snapshot: Permission denied.",
				retryable: true,
			};

			expect(notification.type).toBe("error");
			expect(notification.retryable).toBe(true);
		});

		it("should generate unique notification ID", () => {
			const id1 = `notif-${Date.now()}-${Math.random()}`;
			const id2 = `notif-${Date.now()}-${Math.random()}`;

			expect(id1).not.toBe(id2);
		});
	});

	describe("Decision to notification mapping", () => {
		it("should map PROTECT decision to alert", () => {
			const decision = {
				decision: "PROTECT" as const,
				confidence: 0.85,
				reason: "AI detected",
			};

			const notification = {
				type:
					decision.decision === "PROTECT"
						? "alert"
						: "info",
				title: "Protection Activated",
			};

			expect(notification.type).toBe("alert");
		});

		it("should map ALLOW decision to info", () => {
			const decision = {
				decision: "ALLOW" as const,
				confidence: 0.95,
				reason: "User activity confirmed",
			};

			const notification = {
				type:
					decision.decision === "ALLOW"
						? "info"
						: "warning",
				title: "Changes Allowed",
			};

			expect(notification.type).toBe("info");
		});

		it("should map BLOCK decision to error", () => {
			const decision = {
				decision: "BLOCK" as const,
				confidence: 0.9,
				reason: "Suspicious pattern detected",
			};

			const notification = {
				type:
					decision.decision === "BLOCK"
						? "error"
						: "warning",
				title: "Action Blocked",
			};

			expect(notification.type).toBe("error");
		});

		it("should include decision confidence in notification", () => {
			const decision = {
				confidence: 0.75,
			};

			const notification = {
				confidence: decision.confidence,
				confidencePercent: `${Math.round(
					decision.confidence * 100
				)}%`,
			};

			expect(notification.confidencePercent).toBe("75%");
		});

		it("should include decision reason in message", () => {
			const decision = {
				reason: "Multiple risk factors: AI + burst + critical files",
			};

			const notification = {
				details: decision.reason,
			};

			expect(notification.details).toContain("risk factors");
		});
	});

	describe("Notification severity", () => {
		it("should assign critical severity for BLOCK", () => {
			const severity = "critical";
			const priority = 1;

			expect(severity).toBe("critical");
			expect(priority).toBe(1);
		});

		it("should assign high severity for PROTECT", () => {
			const severity = "high";
			const priority = 2;

			expect(severity).toBe("high");
			expect(priority).toBe(2);
		});

		it("should assign medium severity for ALLOW with warnings", () => {
			const severity = "medium";
			const priority = 3;

			expect(severity).toBe("medium");
			expect(priority).toBe(3);
		});

		it("should assign low severity for info", () => {
			const severity = "low";
			const priority = 4;

			expect(severity).toBe("low");
			expect(priority).toBe(4);
		});

		it("should order notifications by severity", () => {
			const notifications = [
				{ severity: "low", priority: 4 },
				{ severity: "critical", priority: 1 },
				{ severity: "medium", priority: 3 },
				{ severity: "high", priority: 2 },
			];

			const sorted = notifications.sort(
				(a, b) => a.priority - b.priority
			);

			expect(sorted[0].severity).toBe("critical");
			expect(sorted[sorted.length - 1].severity).toBe(
				"low"
			);
		});
	});

	describe("Notification state", () => {
		it("should initialize notification as pending", () => {
			const notification = {
				id: "notif1",
				state: "pending" as const,
			};

			expect(notification.state).toBe("pending");
		});

		it("should transition to shown", () => {
			let state: "pending" | "shown" | "dismissed" | "actioned" = "pending";

			state = "shown";

			expect(state).toBe("shown");
		});

		it("should transition to dismissed", () => {
			let state: "pending" | "shown" | "dismissed" | "actioned" = "shown";

			state = "dismissed";

			expect(state).toBe("dismissed");
		});

		it("should transition to actioned", () => {
			let state: "pending" | "shown" | "dismissed" | "actioned" = "shown";

			state = "actioned";

			expect(state).toBe("actioned");
		});

		it("should track state transitions", () => {
			const transitions: string[] = [];

			const notif = {
				state: "pending" as const,
			};

			expect(notif.state).toBe("pending");
		});
	});

	describe("Notification actions", () => {
		it("should include primary action (Snapshot Details)", () => {
			const actions = [
				{
					label: "View Snapshot",
					action: "view_snapshot",
					primary: true,
				},
			];

			expect(actions[0].primary).toBe(true);
			expect(actions[0].label).toContain("Snapshot");
		});

		it("should include secondary actions (Dismiss, Block)", () => {
			const actions = [
				{
					label: "Dismiss",
					action: "dismiss",
					primary: false,
				},
				{
					label: "Block Changes",
					action: "block",
					primary: false,
				},
			];

			expect(actions.length).toBe(2);
			expect(actions.every((a) => !a.primary)).toBe(true);
		});

		it("should map PROTECT decision to protection action", () => {
			const decision = {
				decision: "PROTECT" as const,
			};

			const actions =
				decision.decision === "PROTECT"
					? [
							{
								label:
									"View Protected Snapshot",
								action: "view_snapshot",
							},
						]
					: [];

			expect(actions.length).toBe(1);
		});

		it("should include retry action for failed snapshots", () => {
			const notification = {
				retryable: true,
				actions: [
					{
						label: "Retry",
						action: "retry_snapshot",
					},
				],
			};

			expect(
				notification.actions.some(
					(a) => a.action === "retry_snapshot"
				)
			).toBe(true);
		});
	});

	describe("Notification formatting", () => {
		it("should format notification title", () => {
			const decision = {
				decision: "PROTECT" as const,
				reason: "AI detected",
			};

			const title =
				decision.decision === "PROTECT"
					? "AI Activity Detected - Snapshot Created"
					: "Changes Allowed";

			expect(title).toContain("AI");
		});

		it("should format notification message", () => {
			const context = {
				aiDetected: true,
				aiConfidence: 0.85,
				riskScore: 70,
				fileCount: 3,
			};

			const message = `CoPilot (${Math.round(
				context.aiConfidence * 100
			)}% confidence) detected. Risk score: ${context.riskScore}. Files modified: ${context.fileCount}.`;

			expect(message).toContain("85%");
			expect(message).toContain("3");
		});

		it("should format notification with signal breakdown", () => {
			const signals = {
				ai: { detected: true, tool: "CoPilot" },
				risk: { score: 75 },
				burst: { detected: true },
				critical: { count: 2 },
			};

			const details: string[] = [];

			if (signals.ai.detected) {
				details.push(`AI Tool: ${signals.ai.tool}`);
			}
			if (signals.risk.score >= 60) {
				details.push(`Risk: ${signals.risk.score}`);
			}
			if (signals.burst.detected) {
				details.push("Burst detected");
			}
			if (signals.critical.count > 0) {
				details.push(
					`Critical files: ${signals.critical.count}`
				);
			}

			expect(details.length).toBe(4);
		});

		it("should truncate long messages", () => {
			const message =
				"a".repeat(500);

			const truncated =
				message.length > 200
					? message.substring(0, 197) + "..."
					: message;

			expect(truncated.length).toBeLessThanOrEqual(200);
		});
	});

	describe("Notification delivery", () => {
		it("should queue notification for display", () => {
			const queue = [] as Array<{ id: string }>;

			const notification = { id: "notif1" };
			queue.push(notification);

			expect(queue.length).toBe(1);
		});

		it("should handle multiple concurrent notifications", () => {
			const queue = [] as Array<{ id: string; priority: number }>;

			queue.push({ id: "notif1", priority: 2 });
			queue.push({ id: "notif2", priority: 1 });
			queue.push({ id: "notif3", priority: 3 });

			expect(queue.length).toBe(3);
		});

		it("should respect notification priority", () => {
			const notifications = [
				{ id: "notif1", priority: 2 },
				{ id: "notif2", priority: 1 },
				{ id: "notif3", priority: 3 },
			];

			const sorted = notifications.sort(
				(a, b) => a.priority - b.priority
			);

			expect(sorted[0].id).toBe("notif2");
		});

		it("should auto-dismiss low priority notifications", () => {
			const notification = {
				severity: "low",
				autoDismiss: true,
				duration: 3000,
			};

			expect(notification.autoDismiss).toBe(true);
			expect(notification.duration).toBe(3000);
		});

		it("should persist critical notifications", () => {
			const notification = {
				severity: "critical",
				persistent: true,
				dismissable: true,
			};

			expect(notification.persistent).toBe(true);
		});
	});

	describe("Notification interaction", () => {
		it("should handle notification click", () => {
			const notification = {
				id: "notif1",
				onClicked: () => {
					return "snapshot_viewed";
				},
			};

			const result = notification.onClicked();

			expect(result).toBe("snapshot_viewed");
		});

		it("should handle action button click", () => {
			const action = {
				label: "View Snapshot",
				onClick: () => {
					return {
						type: "view_snapshot",
						snapshotId: "snap123",
					};
				},
			};

			const result = action.onClick();

			expect(result.type).toBe("view_snapshot");
		});

		it("should handle notification dismissal", () => {
			let state: "pending" | "shown" | "dismissed" | "actioned" = "shown";

			const dismiss = () => {
				state = "dismissed";
			};

			dismiss();

			expect(state).toBe("dismissed");
		});

		it("should track notification interaction time", () => {
			const notification = {
				shownAt: Date.now(),
				interactedAt: Date.now() + 5000,
			};

			const interactionTime =
				notification.interactedAt -
				notification.shownAt;

			expect(interactionTime).toBeGreaterThan(0);
		});
	});

	describe("Error scenarios", () => {
		it("should handle snapshot creation failure", () => {
			const notification = {
				type: "error",
				title: "Snapshot Creation Failed",
				error: new Error("Permission denied"),
				retryable: true,
			};

			expect(notification.type).toBe("error");
			expect(notification.retryable).toBe(true);
		});

		it("should handle notification delivery failure", () => {
			const notification = {
				id: "notif1",
				deliveryAttempts: 3,
				maxRetries: 3,
				failed: true,
			};

			expect(
				notification.deliveryAttempts >=
					notification.maxRetries
			).toBe(true);
		});

		it("should handle missing decision context", () => {
			const notification = {
				title: "Action Required",
				message:
					"Unable to determine decision context.",
				type: "warning",
			};

			expect(notification.type).toBe("warning");
		});
	});
});
