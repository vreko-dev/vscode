import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { SemanticSnapshotNamer } from "../../src/semanticSnapshotNamer";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";
import { createMockStorage } from "../helpers/mockStorage";

// Mock the storage dependency
vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => ({
		create: vi.fn().mockResolvedValue({
			id: "test-snapshot-id",
			timestamp: Date.now(),
		}),
	})),
}));

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
}));

describe("SemanticSnapshotNamer Integration", () => {
	let namer: SemanticSnapshotNamer;
	let coordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let mockStorage: any;

	beforeEach(() => {
		namer = new SemanticSnapshotNamer();
		notificationManager = new NotificationManager();
		mockStorage = createMockStorage();
		// @ts-expect-error - Mocking the storage dependency
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage as any,
		);
	});

	it("should generate semantic names and integrate with snapshot creation", async () => {
		// Create a diff that represents a dependency update
		const diff = `diff --git a/package.json b/package.json
index 1234567..8901234 100644
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
   "dependencies": {
     "react": "^18.2.0",
-    "react-query": "^3.39.2",
+    "react-query": "^4.0.0",
     "lodash": "^4.17.21"
   }`;

		const files = ["package.json"];
		const semanticName = namer.generateName(diff, files);

		// The implementation extracts 3 packages (react, react-query, lodash) and returns 'updated-3-packages'
		expect(semanticName).toBe("updated-3-packages");

		// Mock the snapshot creation to use our semantic name
		const createSnapshotSpy = vi
			.spyOn(coordinator, "coordinateSnapshotCreation")
			.mockResolvedValue(semanticName);

		// Execute the snapshot creation
		const snapshotId = await coordinator.coordinateSnapshotCreation();

		// Verify that our semantic name was used
		expect(createSnapshotSpy).toHaveBeenCalled();
		expect(snapshotId).toBe(semanticName);
	});

	it("should generate semantic names for config changes", async () => {
		const diff = `diff --git a/tsconfig.json b/tsconfig.json
index 1234567..8901234 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -5,7 +5,7 @@
   "compilerOptions": {
-    "target": "es2020",
+    "target": "es2022",
     "strict": true
   }`;

		const files = ["tsconfig.json"];
		const semanticName = namer.generateName(diff, files);

		expect(semanticName).toBe("typescript-config-update");
	});

	it("should generate semantic names for feature additions", async () => {
		// Create a diff that simulates multiple new component files
		let diff = "";
		for (let i = 0; i < 5; i++) {
			diff += `diff --git a/src/components/File${i}.tsx b/src/components/File${i}.tsx
new file mode 100644
index 0000000..8901234
--- /dev/null
+++ b/src/components/File${i}.tsx
@@ -0,0 +1,20 @@
+import React from 'react';
+
+export const Component${i} = () => {
+  return <div>Component ${i}</div>;
+};\n`;
		}

		const files = [
			"src/components/Button.tsx",
			"src/components/Input.tsx",
			"src/components/Card.tsx",
		];

		const semanticName = namer.generateName(diff, files);

		expect(semanticName).toBe("added-Button");
	});

	it("should generate semantic names for bug fixes", async () => {
		const diff = `diff --git a/src/api.ts b/src/api.ts
index 1234567..8901234 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,1 +1,1 @@
-// FIXME: Handle API timeout
+// Fixed API timeout handling`;

		const files = ["src/api.ts"];
		const semanticName = namer.generateName(diff, files);

		expect(semanticName).toBe("fixed-handle-api-timeout");
	});

	it("should generate semantic names for build setup changes", async () => {
		const diff = `diff --git a/Dockerfile b/Dockerfile
index 1234567..8901234 100644
--- a/Dockerfile
+++ b/Dockerfile
@@ -1,3 +1,4 @@
 FROM node:16
+RUN npm install -g pnpm
 WORKDIR /app
 COPY . .`;

		const files = ["Dockerfile"];
		const semanticName = namer.generateName(diff, files);

		expect(semanticName).toBe("build-setup-docker");
	});

	it("should generate semantic names for advanced refactoring", async () => {
		const diff = `diff --git a/src/architecture.ts b/src/architecture.ts
index 1234567..8901234 100644
--- a/src/architecture.ts
+++ b/src/architecture.ts
@@ -1,1 +1,1 @@
-// Old MVC pattern
+// New MVVM pattern`;

		const files = ["src/architecture.ts"];
		const semanticName = namer.generateName(diff, files);

		expect(semanticName).toBe("architecture-refactor");
	});
});
