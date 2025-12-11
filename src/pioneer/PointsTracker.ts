export class PointsTracker {
	addPoints(action: string, points: number): void {
		console.log(`[PointsTracker] Adding ${points} points for ${action}`);
		// Telemetry
		// posthog.capture('pioneer_action_completed', { action, points });
	}

	async syncWithServer(): Promise<void> {
		console.log("[PointsTracker] Syncing points with server...");
		// Stub sync
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}
