/**
 * Operation Manager
 *
 * Core operation lifecycle management - tracking, status updates, and dependencies.
 *
 * @module operations/operation-manager
 */

import type { Operation } from "./types.js";

/**
 * Manages the lifecycle and state of operations
 */
export class OperationManager {
	private operations: Map<string, Operation> = new Map();

	/**
	 * Registers and initiates a new operation
	 */
	startOperation(id: string, name: string, dependencies?: string[]): void {
		const operation: Operation = {
			id,
			name,
			status: "pending",
			progress: 0,
			startTime: Date.now(),
			dependencies,
		};

		this.operations.set(id, operation);
		this.updateOperationStatus(id, "running");
	}

	/**
	 * Updates operation progress (0-100)
	 */
	updateOperationProgress(id: string, progress: number): void {
		const operation = this.operations.get(id);
		if (operation) {
			operation.progress = Math.min(100, Math.max(0, progress));
		}
	}

	/**
	 * Updates operation status and records end time if completed/failed
	 */
	updateOperationStatus(id: string, status: "pending" | "running" | "completed" | "failed"): void {
		const operation = this.operations.get(id);
		if (operation) {
			operation.status = status;

			if (status === "completed" || status === "failed") {
				operation.endTime = Date.now();
			}
		}
	}

	/**
	 * Gets a specific operation by ID
	 */
	getOperation(id: string): Operation | undefined {
		return this.operations.get(id);
	}

	/**
	 * Gets all operations
	 */
	getAllOperations(): Operation[] {
		return Array.from(this.operations.values());
	}

	/**
	 * Checks if an operation can start (all dependencies satisfied)
	 */
	canStartOperation(id: string): boolean {
		const operation = this.operations.get(id);
		if (!operation || !operation.dependencies) {
			return true;
		}

		return operation.dependencies.every((depId) => {
			const dep = this.operations.get(depId);
			return dep && dep.status === "completed";
		});
	}

	/**
	 * Removes an operation from tracking
	 */
	removeOperation(id: string): boolean {
		return this.operations.delete(id);
	}

	/**
	 * Clears all completed/failed operations older than the specified age
	 */
	clearOldOperations(maxAgeMs: number): number {
		const now = Date.now();
		let cleared = 0;

		for (const [id, operation] of this.operations) {
			if (
				(operation.status === "completed" || operation.status === "failed") &&
				operation.endTime &&
				now - operation.endTime > maxAgeMs
			) {
				this.operations.delete(id);
				cleared++;
			}
		}

		return cleared;
	}
}
