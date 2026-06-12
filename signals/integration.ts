/**
 * Signal System Integration
 *
 * Simple integration module for wiring the signal system into the extension.
 * Call initializeSignalSystem() during extension activation.
 *
 * @example
 * ```typescript
 * // In extension.ts activation
 * const signalSystem = initializeSignalSystem(context, daemonBridge);
 * context.subscriptions.push(signalSystem);
 * ```
 *
 * @module signals/integration
 */

import * as vscode from "vscode";
import { type AIProvenanceDecorations, createAIProvenanceDecorations } from "../decorations/AIProvenanceDecorations";
import {
	createIntelligenceCodeLensProvider,
	type IntelligenceCodeLensProvider,
} from "../providers/IntelligenceCodeLensProvider";
import { createIntelligenceHoverProvider } from "../providers/IntelligenceHoverProvider";
import type { DaemonBridge } from "../services/DaemonBridge";
import { type ActivityBarBadgeManager, createActivityBarBadgeManager } from "../ui/ActivityBarBadgeManager";
import { logger } from "../utils/logger";
import { DaemonBridgeAdapter } from "./DaemonBridgeAdapter";
import { registerFileDecorationProvider } from "./FileDecorationProvider";
import { getNotificationQueue, type NotificationQueue } from "./NotificationQueue";
import { SignalCoordinator } from "./SignalCoordinator";
import { getSignalEventBus, type SignalEventBus } from "./SignalEventBus";

/**
 * Signal system instance returned by initializeSignalSystem
 */
export interface SignalSystem extends vscode.Disposable {
	/** The signal coordinator managing all signals */
	coordinator: SignalCoordinator;
	/** The event bus for typed signal events */
	eventBus: SignalEventBus;
	/** The notification queue */
	notificationQueue: NotificationQueue;
	/** The daemon bridge adapter (if daemonBridge was provided) */
	adapter?: DaemonBridgeAdapter;
	/** The intelligence CodeLens provider */
	codeLensProvider?: IntelligenceCodeLensProvider;
	/** The AI provenance decorations (gutter + inline) */
	aiProvenanceDecorations?: AIProvenanceDecorations;
	/** The activity bar badge manager */
	activityBarBadgeManager?: ActivityBarBadgeManager;
}

/**
 * Initialize the signal communication system
 *
 * This wires together:
 * - SignalEventBus (typed event bus)
 * - NotificationQueue (priority-based notification management)
 * - SignalCoordinator (state management and event handling)
 * - FileDecorationProvider (explorer decorations)
 * - IntelligenceCodeLensProvider (proactive intelligence CodeLens)
 * - DaemonBridgeAdapter (if daemonBridge provided)
 *
 * @param context - VS Code extension context
 * @param daemonBridge - Optional DaemonBridge for daemon event wiring
 * @returns SignalSystem instance for disposal
 */
export function initializeSignalSystem(context: vscode.ExtensionContext, daemonBridge?: DaemonBridge): SignalSystem {
	logger.info("Initializing Signal Communication System v2.0");

	// Get or create singletons
	const eventBus = getSignalEventBus();
	const notificationQueue = getNotificationQueue();

	// Create coordinator
	const coordinator = new SignalCoordinator(context, eventBus, notificationQueue, daemonBridge);

	// Register file decoration provider
	const decorationProvider = registerFileDecorationProvider(context, coordinator.getState());

	// Create and register Intelligence CodeLens provider
	const codeLensProvider = createIntelligenceCodeLensProvider(coordinator.getState());
	const codeLensDisposable = vscode.languages.registerCodeLensProvider("*", codeLensProvider);
	context.subscriptions.push(codeLensDisposable);

	// Create and register AI Provenance Decorations (gutter + inline)
	const aiProvenanceDecorations = createAIProvenanceDecorations(coordinator.getState());
	context.subscriptions.push(aiProvenanceDecorations);

	// Create and register Intelligence Hover Provider
	const hoverProvider = createIntelligenceHoverProvider(coordinator.getState());
	context.subscriptions.push(hoverProvider);

	// Create Activity Bar Badge Manager
	const activityBarBadgeManager = createActivityBarBadgeManager(coordinator.getState());
	context.subscriptions.push(activityBarBadgeManager);

	// Create daemon bridge adapter if bridge provided
	let adapter: DaemonBridgeAdapter | undefined;
	if (daemonBridge) {
		adapter = new DaemonBridgeAdapter(daemonBridge, eventBus);
	}

	// Create composite disposable
	const system: SignalSystem = {
		coordinator,
		eventBus,
		notificationQueue,
		adapter,
		codeLensProvider,
		aiProvenanceDecorations,
		activityBarBadgeManager,
		dispose: () => {
			adapter?.dispose();
			activityBarBadgeManager.dispose();
			aiProvenanceDecorations.dispose();
			codeLensProvider.dispose();
			decorationProvider.dispose();
			coordinator.dispose();
		},
	};

	// Register with context
	context.subscriptions.push(system);

	logger.info("Signal Communication System initialized", {
		hasDaemonBridge: !!daemonBridge,
		tier: coordinator.getState().tier,
	});

	return system;
}

/**
 * Get the global signal system state
 *
 * Note: This returns the current state from the global coordinator.
 * For reactive updates, subscribe to SignalState.onChanged.
 */
export function getSignalSystemState(): import("./SignalState").SignalState | null {
	// This is a convenience accessor that would need the coordinator instance
	// In practice, store the coordinator reference from initializeSignalSystem
	return null;
}

/**
 * Re-export disposeSignalEventBus so extension.ts has a single import point
 * for all signal system lifecycle operations.
 *
 * Must be called in extension deactivate() to prevent FM-9: singleton bus
 * surviving reload, causing duplicate subscriptions on re-activation.
 */
export { disposeSignalEventBus } from "./SignalEventBus";
