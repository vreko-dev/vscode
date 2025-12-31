/**
 * ContextFileManager Tests
 *
 * RED-GREEN-REFACTOR: These tests verify the ContextFileManager implementation.
 *
 * 🧢 SnapBack
 */

import * as fs from "fs/promises";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextFileManager, type ContextFileManagerDeps } from "../../src/context/ContextFileManager";

// Mock fs
vi.mock("fs/promises");

describe("ContextFileManager", () => {
	const workspaceRoot = "/test/workspace";
	let manager: ContextFileManager;
	let mockDeps: ContextFileManagerDeps;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mock dependencies
		mockDeps = {
			snapshotService: {
				list: vi.fn().mockResolvedValue([]),
				onSnapshotCreated: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			},
			vitalsService: {
				getVitals: vi.fn().mockResolvedValue(null),
			},
			sessionTracker: {
				getCurrentSession: vi.fn().mockReturnValue(null),
			},
		};

		// Setup fs mocks
		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
		vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

		manager = new ContextFileManager(workspaceRoot, mockDeps);
	});

	afterEach(() => {
		manager.dispose();
	});

	describe("initialize", () => {
		it("should create context directory", async () => {
			await manager.initialize();

			expect(fs.mkdir).toHaveBeenCalledWith(path.join(workspaceRoot, ".snapback", "ctx"), { recursive: true });
		});

		it("should write schema file if missing", async () => {
			await manager.initialize();

			expect(fs.writeFile).toHaveBeenCalledWith(
				path.join(workspaceRoot, ".snapback", "ctx", "context.schema.json"),
				expect.any(String),
				"utf-8",
			);
		});

		it("should create initial context if file missing", async () => {
			await manager.initialize();

			expect(fs.writeFile).toHaveBeenCalledWith(
				path.join(workspaceRoot, ".snapback", "ctx", "context.json"),
				expect.stringContaining('"version"'),
				"utf-8",
			);
		});

		it("should subscribe to snapshot events", async () => {
			await manager.initialize();

			expect(mockDeps.snapshotService.onSnapshotCreated).toHaveBeenCalled();
		});
	});

	describe("context creation", () => {
		it("should include correct version", async () => {
			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.version).toBe("2.0.0");
		});

		it("should include schema reference", async () => {
			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.$schema).toBe("./context.schema.json");
		});

		it("should include generated timestamp", async () => {
			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			const before = new Date().toISOString();
			await manager.initialize();
			const after = new Date().toISOString();

			const context = JSON.parse(writtenContent);
			expect(context.generated).toBeDefined();
			expect(context.generated >= before).toBe(true);
			expect(context.generated <= after).toBe(true);
		});

		it("should include default architecture", async () => {
			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.architecture).toEqual({
				privacy: "metadata-only",
				zeroShortcuts: true,
				typeStrict: true,
			});
		});

		it("should include live state", async () => {
			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.live).toBeDefined();
			expect(context.live.snapshots).toBeDefined();
			expect(context.live.session).toBeDefined();
			expect(context.live.vitals).toBeDefined();
		});
	});

	describe("project detection", () => {
		it("should detect project name from package.json", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({ name: "my-project", version: "1.0.0" });
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.meta.id).toBe("my-project");
			expect(context.meta.version).toBe("1.0.0");
		});

		it("should detect Next.js project type", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({
						name: "test",
						dependencies: { next: "^14.0.0", react: "^18.0.0" },
					});
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.meta.type).toBe("nextjs");
		});

		it("should detect React project type", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({
						name: "test",
						dependencies: { react: "^18.0.0" },
					});
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.meta.type).toBe("react");
		});

		it("should detect Node API project type", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({
						name: "test",
						dependencies: { express: "^4.0.0" },
					});
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.meta.type).toBe("node-api");
		});

		it("should fallback to directory name if no package.json", async () => {
			// fs.readFile already mocked to throw ENOENT

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.meta.id).toBe("workspace"); // basename of /test/workspace
			expect(context.meta.type).toBe("unknown");
		});
	});

	describe("stack detection", () => {
		it("should detect pnpm package manager", async () => {
			vi.mocked(fs.access).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("pnpm-lock.yaml")) {
					return undefined;
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.stack.packageManager).toBe("pnpm");
		});

		it("should detect turborepo monorepo", async () => {
			vi.mocked(fs.access).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("turbo.json")) {
					return undefined;
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.stack.monorepo).toBe("turborepo");
		});

		it("should detect framework version", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({
						dependencies: { next: "^14.2.0" },
					});
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.stack.framework).toBe("next14");
		});

		it("should detect testing framework", async () => {
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("package.json")) {
					return JSON.stringify({
						devDependencies: { vitest: "^1.0.0" },
					});
				}
				throw new Error("ENOENT");
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.stack.testing).toBe("vitest");
		});
	});

	describe("live state", () => {
		it("should include snapshot counts", async () => {
			const now = Date.now();
			mockDeps.snapshotService.list = vi.fn().mockResolvedValue([
				{ id: "1", timestamp: now - 1000 },
				{ id: "2", timestamp: now - 2000 },
				{ id: "3", timestamp: now - 86400000 * 2 }, // 2 days ago
			]);

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.live.snapshots.total).toBe(3);
			expect(context.live.snapshots.today).toBe(2);
			expect(context.live.snapshots.lastCreated).toBeDefined();
		});

		it("should include current session info", async () => {
			mockDeps.sessionTracker.getCurrentSession = vi.fn().mockReturnValue({
				id: "sess_123",
				detectedTool: "Cursor",
				files: ["/path/to/file.ts", "/path/to/other.ts"],
				startedAt: Date.now() - 60000,
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.live.session.id).toBe("sess_123");
			expect(context.live.session.aiTool).toBe("Cursor");
			expect(context.live.session.filesChanged).toContain("file.ts");
			expect(context.live.session.filesChanged).toContain("other.ts");
		});

		it("should include vitals", async () => {
			mockDeps.vitalsService.getVitals = vi.fn().mockResolvedValue({
				pulse: 72,
				temperature: "warm",
				risk: "M",
				health: 85,
				hotFiles: ["api.ts", "index.ts"],
			});

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.live.vitals.pulse).toBe(72);
			expect(context.live.vitals.temperature).toBe("warm");
			expect(context.live.vitals.risk).toBe("M");
			expect(context.live.vitals.health).toBe(85);
			expect(context.live.hotFiles).toContain("api.ts");
		});

		it("should handle missing vitals gracefully", async () => {
			mockDeps.vitalsService.getVitals = vi.fn().mockResolvedValue(null);

			let writtenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					writtenContent = content as string;
				}
			});

			await manager.initialize();

			const context = JSON.parse(writtenContent);
			expect(context.live.vitals.pulse).toBe(0);
			expect(context.live.vitals.temperature).toBe("cold");
			expect(context.live.vitals.risk).toBe("L");
		});
	});

	describe("live state updates", () => {
		it("should update on snapshot created", async () => {
			let snapshotHandler: () => void = () => {};
			mockDeps.snapshotService.onSnapshotCreated = vi.fn().mockImplementation((handler) => {
				snapshotHandler = handler;
				return { dispose: vi.fn() };
			});

			// First call returns empty, subsequent calls return snapshots
			let callCount = 0;
			mockDeps.snapshotService.list = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount === 1) return Promise.resolve([]);
				return Promise.resolve([{ id: "1", timestamp: Date.now() }]);
			});

			let lastWrittenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					lastWrittenContent = content as string;
				}
			});

			// Mock readFile to return existing context
			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("context.json") && lastWrittenContent) {
					return lastWrittenContent;
				}
				throw new Error("ENOENT");
			});

			await manager.initialize();

			// Simulate snapshot created
			snapshotHandler();

			// Wait for async update
			await new Promise((resolve) => setTimeout(resolve, 10));

			const context = JSON.parse(lastWrittenContent);
			expect(context.live.snapshots.total).toBe(1);
		});

		it("should preserve user customizations on update", async () => {
			// Use a past timestamp to ensure the test can detect the update
			const pastTimestamp = "2025-01-01T00:00:00.000Z";
			const customContext = {
				$schema: "./context.schema.json",
				version: "2.0.0",
				generated: pastTimestamp,
				meta: { id: "test", type: "custom-type" },
				stack: { customField: "preserved" },
				architecture: { privacy: "full", zeroShortcuts: false, typeStrict: true },
				constraints: { custom: { value: 123 } },
				quality: { typescript: { errors: 0, strict: true }, coverage: { min: 90 } },
				workflows: { custom: ["step1", "step2"], preFlight: [], verification: [] },
				protocol: { options: "1-2", references: "file:line", risks: "explicit", sizing: "S/M/L" },
				live: {
					snapshots: { today: 0, total: 0, lastCreated: null },
					session: { id: null, aiTool: null, filesChanged: [], startedAt: null },
					vitals: { pulse: 0, temperature: "cold", risk: "L", health: 100 },
					hotFiles: [],
					recentRestores: [],
				},
			};

			// Mock file exists
			vi.mocked(fs.access).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("context.json")) {
					return undefined;
				}
				throw new Error("ENOENT");
			});

			vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
				if (String(filePath).endsWith("context.json")) {
					return JSON.stringify(customContext);
				}
				throw new Error("ENOENT");
			});

			let lastWrittenContent = "";
			vi.mocked(fs.writeFile).mockImplementation(async (filePath, content) => {
				if (String(filePath).endsWith("context.json")) {
					lastWrittenContent = content as string;
				}
			});

			await manager.initialize();

			const updated = JSON.parse(lastWrittenContent);

			// User customizations preserved
			expect(updated.meta.type).toBe("custom-type");
			expect(updated.stack.customField).toBe("preserved");
			expect(updated.architecture.privacy).toBe("full");
			expect(updated.architecture.zeroShortcuts).toBe(false);
			expect(updated.quality.coverage.min).toBe(90);
			expect(updated.workflows.custom).toEqual(["step1", "step2"]);
			expect(updated.constraints.custom).toEqual({ value: 123 });

			// Only live state updated - timestamp should be newer
			expect(updated.generated).not.toBe(pastTimestamp);
		});
	});

	describe("dispose", () => {
		it("should clean up timer", async () => {
			const clearIntervalSpy = vi.spyOn(global, "clearInterval");

			await manager.initialize();
			manager.dispose();

			expect(clearIntervalSpy).toHaveBeenCalled();
		});

		it("should dispose event subscriptions", async () => {
			const disposeFn = vi.fn();
			mockDeps.snapshotService.onSnapshotCreated = vi.fn().mockReturnValue({ dispose: disposeFn });

			await manager.initialize();
			manager.dispose();

			expect(disposeFn).toHaveBeenCalled();
		});
	});
});
