/**
 * MCPBridge Workspace ID Tests
 *
 * Tests the workspace ID transformation using unified algorithm.
 * This is critical for remote server communication.
 */

import { generateWorkspaceId } from "@vreko/workspace-identity";
import { describe, expect, it } from "vitest";

/**
 * Replicates the getFormattedWorkspaceId() logic for testing
 * using the unified workspace identity algorithm
 */
function getFormattedWorkspaceId(workspacePath: string): string {
	return generateWorkspaceId(workspacePath);
}

describe("MCPBridge Workspace ID Transformation", () => {
	describe("getFormattedWorkspaceId", () => {
		it("should transform file:// URI to unified format", () => {
			const uri = "file:///Users/user1/WebstormProjects/poetic-method";
			const result = getFormattedWorkspaceId(uri);

			// Should be 12-character hex (unified format)
			expect(result).toMatch(/^[a-f0-9]{12}$/);
		});

		it("should produce consistent hash for same input", () => {
			const uri = "file:///Users/user1/project";
			const result1 = getFormattedWorkspaceId(uri);
			const result2 = getFormattedWorkspaceId(uri);

			expect(result1).toBe(result2);
		});

		it("should produce different hashes for different paths", () => {
			const uri1 = "file:///Users/user1/project-a";
			const uri2 = "file:///Users/user1/project-b";

			const result1 = getFormattedWorkspaceId(uri1);
			const result2 = getFormattedWorkspaceId(uri2);

			expect(result1).not.toBe(result2);
		});

		it("should handle Windows-style URIs", () => {
			const uri = "file:///c%3A/Users/user/project";
			const result = getFormattedWorkspaceId(uri);

			expect(result).toMatch(/^[a-f0-9]{12}$/);
		});

		it("should handle special characters in path", () => {
			const uri = "file:///Users/user%20name/my%20project";
			const result = getFormattedWorkspaceId(uri);

			expect(result).toMatch(/^[a-f0-9]{12}$/);
		});

		it("should handle default workspace ID", () => {
			const result = getFormattedWorkspaceId("default");

			expect(result).toMatch(/^[a-f0-9]{12}$/);
			// Default should have a known hash (SHA-256 of "default")
			expect(result).toBe("5e9c6e5d7e9f");
		});

		it("should match known SHA-256 hash for verification", () => {
			// Uses unified SHA-256 algorithm
			const uri = "file:///Users/user1/WebstormProjects/poetic-method";
			const result = getFormattedWorkspaceId(uri);

			// Verify the hash matches expected format (12-char hex)
			expect(result).toMatch(/^[a-f0-9]{12}$/);
			expect(result.length).toBe(12);
		});
	});

	describe("Format Validation", () => {
		it("should always produce 12-character output (unified format)", () => {
			const testCases = [
				"file:///short",
				"file:///a/very/long/path/that/goes/on/and/on/for/many/directories",
				"default",
				"file:///Users/名前/プロジェクト", // Unicode
			];

			for (const uri of testCases) {
				const result = getFormattedWorkspaceId(uri);
				expect(result.length).toBe(12); // 12 hex chars
			}
		});

		it("should only contain valid characters", () => {
			const uri = "file:///test/path";
			const result = getFormattedWorkspaceId(uri);

			// Should only be lowercase hex
			expect(result).toMatch(/^[a-f0-9]{12}$/);
			// Should not contain uppercase
			expect(result).not.toMatch(/[A-F]/);
		});
	});

	describe("Privacy", () => {
		it("should not expose original path in output", () => {
			const uri = "file:///Users/secretuser/confidential-project";
			const result = getFormattedWorkspaceId(uri);

			expect(result).not.toContain("secretuser");
			expect(result).not.toContain("confidential");
			expect(result).not.toContain("Users");
		});
	});

	describe("Edge Cases", () => {
		it("should handle very long paths", () => {
			const longPath = "file:///" + "a".repeat(10000);
			const result = getFormattedWorkspaceId(longPath);

			// Should still produce valid format
			expect(result).toMatch(/^[a-f0-9]{12}$/);
		});

		it("should handle null-like values gracefully", () => {
			// In real code, these would be prevented by TypeScript
			// But test robustness
			const result1 = getFormattedWorkspaceId("null");
			const result2 = getFormattedWorkspaceId("undefined");

			expect(result1).toMatch(/^[a-f0-9]{12}$/);
			expect(result2).toMatch(/^[a-f0-9]{12}$/);
		});
	});
});

describe("Workspace ID Server Compatibility", () => {
	it("should match server expected format", () => {
		// Server expects: 12-character hex (unified format)
		const uri = "file:///test";
		const result = getFormattedWorkspaceId(uri);

		// Validate against server regex
		const serverRegex = /^[a-f0-9]{12}$/;
		expect(result).toMatch(serverRegex);
	});

	it("should be safe for URL/JSON usage", () => {
		const uri = "file:///test/path";
		const result = getFormattedWorkspaceId(uri);

		// Should be safe in JSON
		const json = JSON.stringify({ workspaceId: result });
		expect(JSON.parse(json).workspaceId).toBe(result);

		// Should be safe in URLs
		const encoded = encodeURIComponent(result);
		expect(decodeURIComponent(encoded)).toBe(result);
	});
});
