import { EventEmitter } from "node:events";
import { generateSnapshotId } from "@snapback/contracts";
import * as vscode from "vscode";
import { toError } from "../errors/index.js";
import type { Snapshot } from "../types/snapshot.js";
import { logger } from "../utils/logger.js";

export interface SnapshotServiceEvents {
	"snapshot-created": (snapshot: Snapshot) => void;
	"snapshot-deleted": (snapshotId: string) => void;
	"snapshot-restored": (snapshotId: string) => void;
}

export class SnapshotService extends EventEmitter {
	private snapshotsDir: string;
	private _onSnapshotCreated = new vscode.EventEmitter<Snapshot>();
	public readonly onSnapshotCreated = this._onSnapshotCreated.event;

	constructor(workspaceRoot: string) {
		super();
		this.snapshotsDir = vscode.Uri.joinPath(
			vscode.Uri.file(workspaceRoot),
			".snapback",
			"snapshots",
		).fsPath;
	}

	async initialize(): Promise<void> {
		// Ensure snapshots directory exists
		try {
			await vscode.workspace.fs.createDirectory(
				vscode.Uri.file(this.snapshotsDir),
			);
		} catch (error) {
			// Directory might already exist
			logger.debug(
				"Snapshots directory already exists or could not be created:",
				error,
			);
		}
	}

	async createSnapshot(
		files: string[],
		description?: string,
	): Promise<Snapshot> {
		const id = this.generateId();
		const timestamp = Date.now();

		const snapshot: Snapshot = {
			id,
			timestamp,
			files: files,
			meta: {
				description,
			},
		};

		// Save snapshot data
		await this.saveSnapshotData(snapshot, files);

		// Save metadata
		await this.saveSnapshotMetadata(snapshot);

		this._onSnapshotCreated.fire(snapshot);
		this.emit("snapshot-created", snapshot);

		return snapshot;
	}

	async restoreSnapshot(snapshotId: string): Promise<void> {
		const snapshot = await this.getSnapshot(snapshotId);
		if (!snapshot) {
			throw new Error(`Snapshot ${snapshotId} not found`);
		}

		// Restore each file
		for (const file of snapshot.files || []) {
			await this.restoreFile(snapshotId, file);
		}

		this.emit("snapshot-restored", snapshotId);
	}

	async listSnapshots(filePath?: string): Promise<Snapshot[]> {
		try {
			const snapshotsUri = vscode.Uri.file(this.snapshotsDir);
			const files = await vscode.workspace.fs.readDirectory(snapshotsUri);
			const snapshots: Snapshot[] = [];

			for (const [file, fileType] of files) {
				if (fileType === vscode.FileType.File && file.endsWith(".json")) {
					try {
						const content = await vscode.workspace.fs.readFile(
							vscode.Uri.joinPath(snapshotsUri, file),
						);
						const snapshot = JSON.parse(content.toString()) as Snapshot;

						if (!filePath || snapshot.files?.includes(filePath)) {
							snapshots.push(snapshot);
						}
					} catch (error) {
						logger.error(
							`Error reading snapshot file ${file}:`,
							toError(error),
						);
					}
				}
			}

			return snapshots.sort((a, b) => b.timestamp - a.timestamp);
		} catch (error) {
			logger.error("Error listing snapshots:", toError(error));
			return [];
		}
	}

	async deleteSnapshot(snapshotId: string): Promise<void> {
		try {
			// Delete metadata file
			const metaPath = vscode.Uri.joinPath(
				vscode.Uri.file(this.snapshotsDir),
				`${snapshotId}.json`,
			);
			await vscode.workspace.fs.delete(metaPath, { useTrash: false });

			// Delete associated file data
			const snapshotsUri = vscode.Uri.file(this.snapshotsDir);
			const files = await vscode.workspace.fs.readDirectory(snapshotsUri);
			for (const [file] of files) {
				if (file.startsWith(`${snapshotId}-`) && !file.endsWith(".json")) {
					const filePath = vscode.Uri.joinPath(snapshotsUri, file);
					await vscode.workspace.fs.delete(filePath, { useTrash: false });
				}
			}

			this.emit("snapshot-deleted", snapshotId);
		} catch (error) {
			logger.error(`Error deleting snapshot ${snapshotId}:`, toError(error));
			throw error;
		}
	}

	private async getSnapshot(id: string): Promise<Snapshot | null> {
		try {
			const metaPath = vscode.Uri.joinPath(
				vscode.Uri.file(this.snapshotsDir),
				`${id}.json`,
			);
			const content = await vscode.workspace.fs.readFile(metaPath);
			return JSON.parse(content.toString());
		} catch {
			return null;
		}
	}

	private async saveSnapshotData(
		snapshot: Snapshot,
		files: string[],
	): Promise<void> {
		// Save actual file contents for restoration
		for (const file of files) {
			try {
				// Read file content
				const fileUri = vscode.Uri.file(file);
				const content = await vscode.workspace.fs.readFile(fileUri);

				// Save snapshot data
				const snapshotPath = vscode.Uri.joinPath(
					vscode.Uri.file(this.snapshotsDir),
					`${snapshot.id}-${this.sanitizeFileName(file)}`,
				);
				await vscode.workspace.fs.writeFile(snapshotPath, content);
			} catch (error) {
				logger.error(
					`Error saving snapshot data for file ${file}:`,
					toError(error),
				);
			}
		}
	}

	private async saveSnapshotMetadata(snapshot: Snapshot): Promise<void> {
		const metaPath = vscode.Uri.joinPath(
			vscode.Uri.file(this.snapshotsDir),
			`${snapshot.id}.json`,
		);
		const content = JSON.stringify(snapshot, null, 2);
		await vscode.workspace.fs.writeFile(
			metaPath,
			Buffer.from(content, "utf-8"),
		);
	}

	private async restoreFile(
		snapshotId: string,
		filePath: string,
	): Promise<void> {
		try {
			const snapshotPath = vscode.Uri.joinPath(
				vscode.Uri.file(this.snapshotsDir),
				`${snapshotId}-${this.sanitizeFileName(filePath)}`,
			);
			const content = await vscode.workspace.fs.readFile(snapshotPath);
			const fileUri = vscode.Uri.file(filePath);
			await vscode.workspace.fs.writeFile(fileUri, content);
		} catch (error) {
			logger.error(
				`Error restoring file ${filePath} from snapshot ${snapshotId}:`,
				toError(error),
			);
			throw error;
		}
	}

	private sanitizeFileName(filePath: string): string {
		// Replace path separators with safe characters
		return filePath.replace(/[/\\]/g, "__");
	}

	private generateId(): string {
		return generateSnapshotId();
	}

	dispose(): void {
		this._onSnapshotCreated.dispose();
	}
}
