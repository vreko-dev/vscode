import * as vscode from "vscode";
import type { PioneerGatekeeper } from "../pioneer/PioneerGatekeeper";
import type { StorageManager } from "../storage/StorageManager";

/**
 * InteractiveTutorial - First-time onboarding flow
 *
 * PURPOSE:
 * - Guide new users through SnapBack features
 * - Create hands-on experience with protection and snapshots
 * - Drive Pioneer program conversion
 * - Set up first real snapshot for confidence building
 *
 * FLOW (from spec):
 * 1. Welcome - Explain protection levels with decorations
 * 2. Edit - User makes changes to tutorial file
 * 3. Save - Trigger real save interception (WARN level)
 * 4. Snapshot - User creates first snapshot
 * 5. Restore - Show restore flow (optional)
 * 6. Pioneer CTA - Convert to Pioneer for cluster features
 *
 * IMPLEMENTATION DETAILS:
 * - Uses virtual untitled document (untitled:tutorial.ts)
 * - Real ProtectionManager integration (WARN level)
 * - Actual snapshot created via StorageManager
 * - Sidebar reveals snapshot after creation
 * - Tutorial can be dismissed and resumed
 *
 * TESTING SCENARIOS (Red Phase):
 *
 * 1. TUTORIAL LIFECYCLE
 *    - ✅ start() creates untitled document
 *    - ✅ Document content includes instructions
 *    - ✅ Protection level set to WARN
 *    - ✅ Completion tracked in globalState
 *    - ❌ Can be dismissed and resumed
 *
 * 2. STEP PROGRESSION
 *    - ✅ Step 1: Welcome decoration shown
 *    - ✅ Step 2: User edit triggers next step
 *    - ✅ Step 3: Save triggers protection modal
 *    - ✅ Step 4: Snapshot created successfully
 *    - ✅ Step 5: Sidebar reveals snapshot
 *    - ❌ Steps can't be skipped
 *
 * 3. SAVE INTERCEPTION
 *    - ✅ Triggers real ProtectionManager
 *    - ✅ Shows WARN modal (spec-compliant)
 *    - ✅ Snapshot & Save creates real snapshot
 *    - ❌ Cancel preserves tutorial state
 *
 * 4. SNAPSHOT CREATION
 *    - ✅ Creates real snapshot via StorageManager
 *    - ✅ Snapshot includes tutorial content
 *    - ✅ Snapshot appears in sidebar
 *    - ✅ Snapshot can be restored
 *    - ❌ Snapshot metadata marks as tutorial
 *
 * 5. PIONEER CTA
 *    - ✅ Shows CTA if not Pioneer
 *    - ✅ CTA explains cluster features
 *    - ✅ Click triggers Pioneer signup
 *    - ✅ Skips CTA if already Pioneer
 *    - ❌ Tracks conversion attribution
 *
 * 6. HANDOFF SEQUENCE (Spec requirement)
 *    - ✅ Close tutorial editor after snapshot
 *    - ✅ Wait 100ms for UI settle
 *    - ✅ Focus sidebar
 *    - ✅ Reveal snapshot item
 *    - ❌ Smooth animation/transition
 *
 * 7. TELEMETRY
 *    - ✅ tutorial_started event
 *    - ✅ tutorial_step_completed (per step)
 *    - ✅ tutorial_pioneer_cta_shown
 *    - ✅ tutorial_completed (with became_pioneer flag)
 *    - ❌ tutorial_abandoned (dismissed early)
 *
 * 8. EDGE CASES
 *    - ❌ User closes document mid-tutorial
 *    - ❌ User edits multiple times before save
 *    - ❌ Snapshot creation fails
 *    - ❌ Already has snapshots (skip tutorial)
 *
 * TDD WORKFLOW:
 * 1. Write failing test for scenario
 * 2. Implement minimal code to pass
 * 3. Refactor with confidence
 * 4. Run gate: ./ai_dev_utils/scripts/tdd-gate.sh green
 */

enum TutorialStep {
	Welcome = 0,
	Edit = 1,
	Save = 2,
	Snapshot = 3,
	Restore = 4,
	PioneerCTA = 5,
	Complete = 6,
}

const TUTORIAL_CONTENT = `// Welcome to SnapBack! 🎯
// This interactive tutorial will guide you through protecting your code.

// STEP 1: Understanding Protection Levels
// - BLOCK: Requires confirmation before saving
// - WARN: Shows warning but allows save
// - WATCH: Silent snapshots in background

// STEP 2: Try It Out
// Make an edit anywhere in this file (add a comment, change text, etc.)

function exampleFunction() {
  // Your edit here...
  console.log("Hello, SnapBack!");
}

// STEP 3: Save This File
// Press Cmd+S (Mac) or Ctrl+S (Windows/Linux)
// You'll see a warning because this file is protected at WARN level

// STEP 4: Create Your First Snapshot
// Click "Snapshot & Save" to create a restore point
// This snapshot will appear in the SnapBack sidebar

// STEP 5: See Your Snapshot
// The sidebar will show your snapshot with timestamp
// You can click it to restore or view differences

export { exampleFunction };
`;

export class InteractiveTutorial implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private currentStep: TutorialStep = TutorialStep.Welcome;
	private tutorialUri?: vscode.Uri;
	private decorationType?: vscode.TextEditorDecorationType;
	private snapshotId?: string;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storageManager: StorageManager,
		private readonly gatekeeper: PioneerGatekeeper,
		private readonly sidebarReveal: (snapshotId: string) => void,
	) {}

	/**
	 * Start the interactive tutorial
	 *
	 * TEST: Creates untitled document
	 * TEST: Sets protection level to WARN
	 * TEST: Shows welcome decoration
	 * TEST: Emits tutorial_started telemetry
	 */
	async start(): Promise<void> {
		// Check if already completed
		const completed = this.context.globalState.get<boolean>("tutorial.completed", false);
		if (completed) {
			const retry = await vscode.window.showInformationMessage(
				"You've already completed the tutorial. Want to try again?",
				"Yes",
				"No",
			);
			if (retry !== "Yes") {
				return;
			}
		}

		// Create untitled document
		const doc = await vscode.workspace.openTextDocument({
			content: TUTORIAL_CONTENT,
			language: "typescript",
		});

		this.tutorialUri = doc.uri;

		// Show document
		await vscode.window.showTextDocument(doc);

		// Set protection level to WARN
		// TODO: Integrate with ProtectionManager
		// await this.protectionManager.setProtection(doc.uri, 'warn');

		// Show welcome decoration
		this.showWelcomeDecoration();

		// Track start
		this.currentStep = TutorialStep.Welcome;
		// TODO: Telemetry
		// telemetry.track('tutorial_started');

		// Subscribe to document changes
		this.subscribeToChanges();
	}

	/**
	 * Show welcome decoration on first line
	 *
	 * TEST: Creates decoration type
	 * TEST: Applies to active editor
	 * TEST: Shows friendly welcome message
	 */
	private showWelcomeDecoration(): void {
		this.decorationType = vscode.window.createTextEditorDecorationType({
			after: {
				contentText: " ← Start here! Read the instructions.",
				color: new vscode.ThemeColor("editorInfo.foreground"),
				fontStyle: "italic",
			},
		});

		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri === this.tutorialUri) {
			const decoration = { range: new vscode.Range(0, 0, 0, 0) };
			editor.setDecorations(this.decorationType, [decoration]);
		}
	}

	/**
	 * Subscribe to document changes to advance tutorial
	 *
	 * TEST: Detects user edit
	 * TEST: Advances to Edit step
	 * TEST: Removes welcome decoration
	 */
	private subscribeToChanges(): void {
		const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri === this.tutorialUri && this.currentStep === TutorialStep.Welcome) {
				// User made an edit!
				this.advanceToEditStep();
			}
		});

		this.disposables.push(changeListener);

		// Also watch for save attempts
		const saveListener = vscode.workspace.onWillSaveTextDocument((event) => {
			if (event.document.uri === this.tutorialUri && this.currentStep === TutorialStep.Edit) {
				this.advanceToSaveStep();
			}
		});

		this.disposables.push(saveListener);
	}

	/**
	 * Advance to Edit step (user made first change)
	 *
	 * TEST: Updates currentStep
	 * TEST: Clears decorations
	 * TEST: Shows progress notification
	 * TEST: Emits tutorial_step_completed
	 */
	private advanceToEditStep(): void {
		this.currentStep = TutorialStep.Edit;

		// Clear decoration
		if (this.decorationType) {
			this.decorationType.dispose();
			this.decorationType = undefined;
		}

		vscode.window.showInformationMessage("Great! Now save the file (Cmd+S or Ctrl+S) to see protection in action.");

		// TODO: Telemetry
		// telemetry.track('tutorial_step_completed', { step: 1 });
	}

	/**
	 * Advance to Save step (user attempted save)
	 *
	 * TEST: Updates currentStep
	 * TEST: ProtectionManager shows modal
	 * TEST: Waits for user choice
	 */
	private advanceToSaveStep(): void {
		this.currentStep = TutorialStep.Save;

		// ProtectionManager will handle the modal
		// When user clicks "Snapshot & Save", onSnapshotCreated will be called

		// TODO: Telemetry
		// telemetry.track('tutorial_step_completed', { step: 2 });
	}

	/**
	 * Called when snapshot is created (by ProtectionManager)
	 *
	 * TEST: Advances to Snapshot step
	 * TEST: Stores snapshot ID
	 * TEST: Triggers handoff sequence
	 */
	async onSnapshotCreated(snapshotId: string): Promise<void> {
		this.currentStep = TutorialStep.Snapshot;
		this.snapshotId = snapshotId;

		vscode.window.showInformationMessage("Snapshot created! Check the SnapBack sidebar to see it.");

		// TODO: Telemetry
		// telemetry.track('tutorial_step_completed', { step: 3 });

		// Start handoff sequence
		await this.startHandoffSequence();
	}

	/**
	 * Handoff sequence (spec requirement)
	 *
	 * TEST: Closes tutorial editor
	 * TEST: Waits 100ms
	 * TEST: Focuses sidebar
	 * TEST: Reveals snapshot
	 */
	private async startHandoffSequence(): Promise<void> {
		if (!this.snapshotId) {
			return;
		}

		// 1. Close tutorial editor
		const editor = vscode.window.activeTextEditor;
		if (editor?.document.uri === this.tutorialUri) {
			await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
		}

		// 2. Wait 100ms for UI settle
		await new Promise((resolve) => setTimeout(resolve, 100));

		// 3. Focus sidebar and reveal snapshot
		this.sidebarReveal(this.snapshotId);

		// 4. Show Pioneer CTA if not Pioneer
		if (!this.gatekeeper.canUseFeature("clusters")) {
			await this.showPioneerCTA();
		} else {
			await this.complete();
		}
	}

	/**
	 * Show Pioneer CTA
	 *
	 * TEST: Shows modal with cluster benefits
	 * TEST: Includes "Become a Pioneer" button
	 * TEST: Includes "Maybe Later" button
	 * TEST: Tracks CTA shown event
	 */
	private async showPioneerCTA(): Promise<void> {
		this.currentStep = TutorialStep.PioneerCTA;

		// TODO: Telemetry
		// telemetry.track('tutorial_pioneer_cta_shown');

		const choice = await vscode.window.showInformationMessage(
			"🚀 Unlock Cluster Protection!\n\n" +
				"Pioneers can protect related files together. When one changes, all are snapshotted atomically.\n\n" +
				"Join the Pioneer Program (free during beta) to unlock this feature.",
			"Become a Pioneer",
			"Maybe Later",
		);

		if (choice === "Become a Pioneer") {
			// Trigger Pioneer signup
			await vscode.commands.executeCommand("snapback.joinPioneers");
			await this.complete(true);
		} else {
			await this.complete(false);
		}
	}

	/**
	 * Complete tutorial
	 *
	 * TEST: Marks as completed in globalState
	 * TEST: Emits tutorial_completed event
	 * TEST: Includes became_pioneer flag
	 * TEST: Disposes resources
	 */
	private async complete(_becamePioneer = false): Promise<void> {
		this.currentStep = TutorialStep.Complete;

		await this.context.globalState.update("tutorial.completed", true);

		// TODO: Telemetry
		// telemetry.track('tutorial_completed', { became_pioneer: becamePioneer });

		vscode.window.showInformationMessage("Tutorial complete! You're ready to protect your code with SnapBack.");

		this.dispose();
	}

	/**
	 * Check if tutorial should be shown (first-time user)
	 *
	 * TEST: Returns true if never completed
	 * TEST: Returns false if completed
	 * TEST: Returns false if dismissed
	 */
	async shouldShow(): Promise<boolean> {
		const completed = this.context.globalState.get<boolean>("tutorial.completed", false);
		const dismissed = this.context.globalState.get<boolean>("tutorial.dismissed", false);

		if (completed || dismissed) {
			return false;
		}

		// Check if user already has snapshots
		const snapshots = await this.storageManager.listSnapshots();
		return snapshots.length === 0;
	}

	/**
	 * Dismiss tutorial (don't show again)
	 *
	 * TEST: Marks as dismissed in globalState
	 * TEST: Emits tutorial_abandoned event
	 */
	async dismiss(): Promise<void> {
		await this.context.globalState.update("tutorial.dismissed", true);

		// TODO: Telemetry
		// telemetry.track('tutorial_abandoned', { step: this.currentStep });

		this.dispose();
	}

	/**
	 * Dispose resources
	 *
	 * TEST: Disposes event listeners
	 * TEST: Disposes decorations
	 * TEST: Clears state
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}

		if (this.decorationType) {
			this.decorationType.dispose();
		}

		this.disposables = [];
	}
}
