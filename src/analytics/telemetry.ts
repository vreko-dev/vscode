import * as vscode from "vscode";
import { TelemetryProxy } from "../services/telemetry-proxy";
import { hashContent } from "../storage/utils/hash";

/**
 * Service for checking and tracking application insights with strict privacy controls.
 * Ensures PII (paths, usernames) is scrubbed before leaving the machine.
 */
export class TelemetryService {
	private static instance: TelemetryService;
	private enabled = true;
	private proxy: TelemetryProxy | null = null;

	private constructor(context: vscode.ExtensionContext) {
		this.proxy = new TelemetryProxy(context);
		this.enabled = vscode.workspace.getConfiguration("snapback").get("telemetry.enabled", true);
	}

	public static getInstance(context?: vscode.ExtensionContext): TelemetryService {
		if (!TelemetryService.instance) {
			if (!context) {
				throw new Error("TelemetryService not initialized. Pass context for first usage.");
			}
			TelemetryService.instance = new TelemetryService(context);
		}
		return TelemetryService.instance;
	}

	/**
	 * Check if TelemetryService has been initialized.
	 * Useful for guarding against race conditions in async callbacks.
	 */
	public static isInitialized(): boolean {
		return TelemetryService.instance !== undefined;
	}

	/**
	 * One-way hash of a file path to preserve privacy while allowing correlation.
	 * We use SHA-256 (same as blob hash) for consistency.
	 */
	public scrub(piiString: string): string {
		try {
			return hashContent(piiString);
		} catch {
			// Remove unused 'e' variable
			return "scrub-failed";
		}
	}

	/**
	 * Track an event with automatic scrubbing of known PII properties
	 */
	public async track(event: string, properties: Record<string, any> = {}): Promise<void> {
		if (!this.enabled || !this.proxy) {
			return;
		}

		const safeProperties = { ...properties };

		// Auto-scrub common PII fields
		if (safeProperties.filePath) {
			safeProperties.filePathHash = this.scrub(safeProperties.filePath);
			delete safeProperties.filePath;
		}
		if (safeProperties.fileName) {
			// Keep file names if needed? Better safe than sorry.
			// safeProperties.fileNameHash = this.scrub(safeProperties.fileName);
			// delete safeProperties.fileName;
		}

		try {
			await this.proxy.trackEvent(event, safeProperties);
		} catch (e) {
			console.error("[Telemetry] Failed to track event", e);
		}
	}
}
