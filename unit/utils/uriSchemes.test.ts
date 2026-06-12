import { describe, it, expect } from "vitest";
import { SNAPSHOT_SCHEME, createSnapshotUri } from "../../../src/constants/uriSchemes";

describe("uriSchemes", () => {
	describe("SNAPSHOT_SCHEME", () => {
		it("should have the correct scheme value", () => {
			expect(SNAPSHOT_SCHEME).toBe("vreko-snapshot");
		});
	});

	describe("createSnapshotUri", () => {
		it("should create a URI with the correct scheme", () => {
			const uri = createSnapshotUri("snap-123", "src/test.ts");
			const uriString = uri.toString();

			expect(uriString.startsWith("vreko-snapshot:")).toBe(true);
		});

		it("should include snapshotId and filePath in the URI", () => {
			const uri = createSnapshotUri("snap-123", "src/test.ts");
			const uriString = uri.toString();

			expect(uriString).toContain("snap-123");
			expect(uriString).toContain("src/test.ts");
		});

		it("should encode special characters in file paths", () => {
			const uri = createSnapshotUri("snap-123", "src/file with spaces.ts");
			const uriString = uri.toString();

			// Spaces should be encoded as %20 in the URI string representation
			expect(uriString).toContain("file%20with%20spaces");
		});

		it("should handle nested file paths", () => {
			const uri = createSnapshotUri("snap-456", "deep/nested/path/component.tsx");
			const uriString = uri.toString();

			expect(uriString).toContain("snap-456/deep/nested/path/component.tsx");
		});

		it("should return a URI object with toString method", () => {
			const uri = createSnapshotUri("snap-123", "test.ts");

			expect(typeof uri.toString).toBe("function");
			expect(uri.toString()).toBeTruthy();
		});

		it("should use colon format (not //) for virtual document provider compatibility", () => {
			const uri = createSnapshotUri("snap-123", "test.ts");
			const uriString = uri.toString();

			// VS Code virtual document providers use scheme:path format
			// NOT scheme://authority/path format
			expect(uriString).toMatch(/^vreko-snapshot:/);
			expect(uriString).not.toContain("vreko-snapshot://");
		});

		it("should handle file paths with special characters", () => {
			const uri = createSnapshotUri("snap-789", "src/[test].ts");
			const uriString = uri.toString();

			expect(uriString).toContain("%5Btest%5D");
		});

		it("should handle root-level files", () => {
			const uri = createSnapshotUri("snap-000", "package.json");
			const uriString = uri.toString();

			expect(uriString).toContain("snap-000/package.json");
		});
	});
});
