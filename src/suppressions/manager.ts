import type * as vscode from "vscode";

// Define the suppression type
type SuppressionType = "line" | "file" | "repo";

export interface Suppression {
	id: string;
	type: SuppressionType;
	uri?: string;
	line?: number;
	content?: string;
	pattern?: string;
	reason: string;
	createdAt: number; // Store as number for easier calculations
	expiresAt: number;
}

export class SuppressionManager {
	private suppressions: Map<string, Suppression> = new Map();
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.loadSuppressions();
	}

	private loadSuppressions(): void {
		const stored = this.context.globalState.get<Suppression[]>(
			"snapback.suppressions",
			[],
		);
		// Ensure stored is an array before iterating
		if (Array.isArray(stored)) {
			stored.forEach((suppression) => {
				this.suppressions.set(suppression.id, suppression);
			});
		}
	}

	private saveSuppressions(): Thenable<void> {
		const suppressionsArray = Array.from(this.suppressions.values());
		return this.context.globalState.update(
			"snapback.suppressions",
			suppressionsArray,
		);
	}

	private getExpiryTime(type: SuppressionType): number {
		switch (type) {
			case "line":
				return 7 * 24 * 60 * 60 * 1000; // 7 days
			case "file":
				return 30 * 24 * 60 * 60 * 1000; // 30 days
			case "repo":
				return 90 * 24 * 60 * 60 * 1000; // 90 days
		}
	}

	private isUriObject(obj: unknown): obj is vscode.Uri {
		if (!obj || typeof obj !== "object") {
			return false;
		}

		const uri = obj as vscode.Uri;
		return (
			typeof uri.toString === "function" &&
			(uri.fsPath !== undefined || uri.path !== undefined)
		);
	}

	private getSuppressionId(
		type: SuppressionType,
		uriOrPattern?: vscode.Uri | string,
		line?: number,
	): string {
		switch (type) {
			case "line":
				if (this.isUriObject(uriOrPattern)) {
					return `${type}:${uriOrPattern.toString()}:${line}`;
				}
				break;
			case "file":
				if (this.isUriObject(uriOrPattern)) {
					return `${type}:${uriOrPattern.toString()}`;
				}
				break;
			case "repo":
				if (typeof uriOrPattern === "string") {
					return `${type}:${uriOrPattern}`;
				}
				break;
		}

		throw new Error(`Invalid parameters for suppression type: ${type}`);
	}

	/**
	 * Add a suppression
	 */
	public async addSuppression(
		type: SuppressionType,
		uriOrPattern?: vscode.Uri | string,
		lineOrReason?: number | string,
		content?: string,
		reason?: string,
	): Promise<void> {
		// Handle the parameters based on type
		let actualReason: string;
		if (type === "line") {
			actualReason = reason || "";
		} else if (type === "file") {
			actualReason = lineOrReason as string;
		} else {
			actualReason = lineOrReason as string;
		}

		const id = this.getSuppressionId(
			type,
			uriOrPattern,
			lineOrReason as number,
		);

		const suppression: Suppression = {
			id,
			type,
			reason: actualReason,
			createdAt: Date.now(),
			expiresAt: Date.now() + this.getExpiryTime(type),
		};

		// Add type-specific properties
		if (type === "line" && this.isUriObject(uriOrPattern)) {
			suppression.uri = uriOrPattern.toString();
			suppression.line = lineOrReason as number;
			suppression.content = content;
		} else if (type === "file" && this.isUriObject(uriOrPattern)) {
			suppression.uri = uriOrPattern.toString();
		} else if (type === "repo" && typeof uriOrPattern === "string") {
			suppression.pattern = uriOrPattern;
		}

		this.suppressions.set(id, suppression);
		await this.saveSuppressions();
	}

	/**
	 * Check if content is suppressed
	 */
	public async isSuppressed(
		type: SuppressionType,
		uriOrPattern?: vscode.Uri | string,
		line?: number,
		content?: string,
	): Promise<boolean> {
		const now = Date.now();
		try {
			const id = this.getSuppressionId(type, uriOrPattern, line);
			const suppression = this.suppressions.get(id);

			if (!suppression) {
				return false;
			}

			// Check expiration
			if (now > suppression.expiresAt) {
				// Expired - remove it
				this.suppressions.delete(id);
				await this.saveSuppressions();
				return false;
			}

			// For line suppressions, also check content match if provided
			if (type === "line" && content && suppression.content) {
				return content === suppression.content;
			}

			return true;
		} catch (_error) {
			// If we can't generate a valid ID, it's not suppressed
			return false;
		}
	}

	/**
	 * Remove a suppression
	 */
	public async removeSuppression(
		type: SuppressionType,
		uriOrPattern?: vscode.Uri | string,
		line?: number,
	): Promise<void> {
		try {
			const id = this.getSuppressionId(type, uriOrPattern, line);
			this.suppressions.delete(id);
			await this.saveSuppressions();
		} catch (_error) {
			// If we can't generate a valid ID, there's nothing to remove
		}
	}

	/**
	 * Get all active suppressions
	 */
	public getActiveSuppressions(): Suppression[] {
		const now = Date.now();
		const activeSuppressions: Suppression[] = [];

		// Convert iterator to array to avoid downlevelIteration issues
		const suppressionsArray = Array.from(this.suppressions.values());
		for (const suppression of suppressionsArray) {
			if (now <= suppression.expiresAt) {
				activeSuppressions.push(suppression);
			} else {
				// Expired - remove it
				this.suppressions.delete(suppression.id);
			}
		}

		return activeSuppressions;
	}

	/**
	 * Clear all expired suppressions
	 */
	public async clearExpiredSuppressions(): Promise<void> {
		const now = Date.now();
		const expiredIds: string[] = [];

		// Convert iterator to array to avoid downlevelIteration issues
		const entriesArray = Array.from(this.suppressions.entries());
		for (const [id, suppression] of entriesArray) {
			if (now > suppression.expiresAt) {
				expiredIds.push(id);
			}
		}

		for (const id of expiredIds) {
			this.suppressions.delete(id);
		}

		if (expiredIds.length > 0) {
			await this.saveSuppressions();
		}
	}
}
