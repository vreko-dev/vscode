/**
 * StatusBarAnimator - Frame-based animation utility for VS Code status bar items
 *
 * Features:
 * - Accessibility: Respects workbench.reduceMotion setting
 * - Frame cycling with configurable duration
 * - Proper cleanup on dispose (no orphaned intervals)
 * - Memory leak prevention (WeakMap for item references)
 * - Concurrent animation handling (auto-cancels previous on same item)
 *
 * @example
 * ```ts
 * import { createStatusBarAnimator, ANIMATION_PRESETS } from "@vscode/utils/statusBarAnimator";
 *
 * const animator = createStatusBarAnimator();
 * const disposable = animator.animate(statusBarItem, ANIMATION_PRESETS.snapshotCreated);
 * // Animation runs, then shows final icon
 * // Call disposable.dispose() to cancel early
 * ```
 *
 * @module
 */

import * as vscode from "vscode";

/**
 * Configuration for a single animation sequence
 */
export interface AnimationConfig {
	/** Array of icons/text to cycle through */
	frames: string[];
	/** Duration each frame is shown, in milliseconds */
	frameDurationMs: number;
	/** Icon to show after animation completes */
	finalIcon: string;
	/** If true, loops forever until disposed */
	loop?: boolean;
	/** Telemetry identifier for this animation type */
	animationType?: string;
}

/**
 * Telemetry event emitted when animation completes
 */
export interface AnimationCompleteEvent {
	animationType?: string;
	completed: boolean;
	skippedDueToReduceMotion: boolean;
}

/**
 * Options for creating a StatusBarAnimator instance
 */
export interface StatusBarAnimatorOptions {
	/** Callback fired when animation completes (for telemetry) */
	onAnimationComplete?: (event: AnimationCompleteEvent) => void;
}

/**
 * Preset animation configurations for common SnapBack events
 */
export const ANIMATION_PRESETS = {
	/** Animation for snapshot creation */
	snapshotCreated: {
		frames: ["⚡", "📷", "✓"],
		frameDurationMs: 150,
		finalIcon: "$(shield)",
		animationType: "snapshot_created",
	} as AnimationConfig,

	/** Animation for protection level change */
	protectionChanged: {
		frames: ["$(shield)", "$(lock)", "$(shield)"],
		frameDurationMs: 200,
		finalIcon: "$(shield)",
		animationType: "protection_changed",
	} as AnimationConfig,

	/** Animation when AI activity is detected */
	aiDetected: {
		frames: ["🤖", "$(eye)", "🤖"],
		frameDurationMs: 200,
		finalIcon: "$(shield)",
		animationType: "ai_detected",
	} as AnimationConfig,

	/** Animation for restore operation */
	snapshotRestored: {
		frames: ["$(history)", "$(arrow-left)", "$(check)"],
		frameDurationMs: 150,
		finalIcon: "$(shield)",
		animationType: "snapshot_restored",
	} as AnimationConfig,
} as const;

export type AnimationPresets = typeof ANIMATION_PRESETS;

/**
 * Active animation state tracked per status bar item
 */
interface AnimationState {
	intervalId: ReturnType<typeof setInterval>;
	config: AnimationConfig;
	currentFrame: number;
	originalText: string;
}

/**
 * StatusBarAnimator - Manages frame-based animations for status bar items
 *
 * Key responsibilities:
 * - Respects accessibility settings (reduceMotion)
 * - Prevents memory leaks with WeakMap storage
 * - Auto-cancels previous animation when new one starts on same item
 * - Provides dispose pattern for cleanup
 */
export class StatusBarAnimator implements vscode.Disposable {
	private readonly activeAnimations = new WeakMap<vscode.StatusBarItem, AnimationState>();
	private readonly animationRefs = new Set<vscode.StatusBarItem>();
	private readonly onAnimationComplete?: (event: AnimationCompleteEvent) => void;

	constructor(options?: StatusBarAnimatorOptions) {
		this.onAnimationComplete = options?.onAnimationComplete;
	}

	/**
	 * Check if reduceMotion is enabled in VS Code settings
	 */
	private isReduceMotionEnabled(): boolean {
		const config = vscode.workspace.getConfiguration("workbench");
		return config.get<boolean>("reduceMotion", false);
	}

	/**
	 * Extract the icon portion from status bar text
	 * Handles both $(...) codicons and emoji icons
	 */
	private extractIconFromText(text: string): { icon: string; rest: string } {
		// Match $(...) codicon pattern at start
		const codiconMatch = text.match(/^(\$\([^)]+\))\s*/);
		if (codiconMatch) {
			return {
				icon: codiconMatch[1],
				rest: text.slice(codiconMatch[0].length),
			};
		}

		// Match emoji at start (Unicode emoji patterns)
		const emojiMatch = text.match(/^([\u{1F300}-\u{1FAFF}])\s*/u);
		if (emojiMatch) {
			return {
				icon: emojiMatch[1],
				rest: text.slice(emojiMatch[0].length),
			};
		}

		// No icon found - return empty icon and full text
		return { icon: "", rest: text };
	}

	/**
	 * Replace the icon in status bar text while preserving the rest
	 */
	private replaceIcon(originalText: string, newIcon: string): string {
		const { rest } = this.extractIconFromText(originalText);
		return rest ? `${newIcon} ${rest}` : newIcon;
	}

	/**
	 * Start an animation on a status bar item
	 *
	 * @param item - The VS Code status bar item to animate
	 * @param config - Animation configuration
	 * @returns Disposable to cancel the animation early
	 */
	animate(item: vscode.StatusBarItem, config: AnimationConfig): vscode.Disposable {
		// Guard: null/undefined item
		if (!item) {
			return { dispose: () => {} };
		}

		// Cancel any existing animation on this item
		this.cancelAnimation(item);

		const originalText = item.text;
		const reduceMotion = this.isReduceMotionEnabled();

		// Accessibility: skip animation if reduceMotion is enabled
		if (reduceMotion) {
			item.text = this.replaceIcon(originalText, config.finalIcon);
			this.emitComplete(config, true, true);
			return { dispose: () => {} };
		}

		// Handle empty frames - show final icon immediately
		if (config.frames.length === 0) {
			item.text = this.replaceIcon(originalText, config.finalIcon);
			this.emitComplete(config, true, false);
			return { dispose: () => {} };
		}

		// Set initial frame
		let currentFrame = 0;
		item.text = this.replaceIcon(originalText, config.frames[currentFrame]);

		// Start frame cycling
		const intervalId = setInterval(() => {
			currentFrame++;

			if (currentFrame >= config.frames.length) {
				if (config.loop) {
					// Loop back to start
					currentFrame = 0;
					item.text = this.replaceIcon(originalText, config.frames[currentFrame]);
				} else {
					// Animation complete - show final icon
					this.cancelAnimation(item);
					item.text = this.replaceIcon(originalText, config.finalIcon);
					this.emitComplete(config, true, false);
				}
			} else {
				// Show next frame
				item.text = this.replaceIcon(originalText, config.frames[currentFrame]);
			}
		}, config.frameDurationMs);

		// Store animation state
		const state: AnimationState = {
			intervalId,
			config,
			currentFrame,
			originalText,
		};

		this.activeAnimations.set(item, state);
		this.animationRefs.add(item);

		// Return disposable for early cancellation
		return {
			dispose: () => {
				const wasActive = this.activeAnimations.has(item);
				this.cancelAnimation(item);

				// Restore to final state on dispose
				if (wasActive) {
					item.text = this.replaceIcon(originalText, config.finalIcon);
				}
			},
		};
	}

	/**
	 * Cancel an active animation on an item
	 */
	private cancelAnimation(item: vscode.StatusBarItem): void {
		const state = this.activeAnimations.get(item);
		if (state) {
			clearInterval(state.intervalId);
			this.activeAnimations.delete(item);
			this.animationRefs.delete(item);
		}
	}

	/**
	 * Emit telemetry event for animation completion
	 */
	private emitComplete(config: AnimationConfig, completed: boolean, skippedDueToReduceMotion: boolean): void {
		if (this.onAnimationComplete) {
			this.onAnimationComplete({
				animationType: config.animationType,
				completed,
				skippedDueToReduceMotion,
			});
		}
	}

	/**
	 * Get count of currently active animations
	 * Useful for testing and debugging
	 */
	getActiveAnimationCount(): number {
		return this.animationRefs.size;
	}

	/**
	 * Dispose all active animations and cleanup
	 */
	dispose(): void {
		for (const item of this.animationRefs) {
			this.cancelAnimation(item);
		}
		this.animationRefs.clear();
	}
}

/**
 * Factory function to create a StatusBarAnimator instance
 */
export function createStatusBarAnimator(options?: StatusBarAnimatorOptions): StatusBarAnimator {
	return new StatusBarAnimator(options);
}
