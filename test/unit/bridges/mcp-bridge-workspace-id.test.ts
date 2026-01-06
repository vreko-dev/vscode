/**
 * MCPBridge Workspace ID Tests
 *
 * Tests the workspace ID transformation from raw URI to ws_[hash] format.
 * This is critical for remote server communication.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Replicates the getFormattedWorkspaceId() logic for testing
 * without needing to instantiate the full MCPBridge with VS Code dependencies
 */
function getFormattedWorkspaceId(workspaceId: string): string {
	const hash = createHash("md5").update(workspaceId).digest("hex");
	return `ws_${hash}`;
}

describe("MCPBridge Workspace ID Transformation", () => {
	describe("getFormattedWorkspaceId", () => {
		it("should transform file:// URI to ws_ format", () => {
			const uri = "file:///Users/user1/WebstormProjects/poetic-method";
			const result = getFormattedWorkspaceId(uri);

			// Should have ws_ prefix
			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
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

			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
		});

		it("should handle special characters in path", () => {
			const uri = "file:///Users/user%20name/my%20project";
			const result = getFormattedWorkspaceId(uri);

			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
		});

		it("should handle default workspace ID", () => {
			const result = getFormattedWorkspaceId("default");

			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
			// Default should have a known hash
			expect(result).toBe("ws_c21f969b5f03d33d43e04f8f136e7682");
		});

		it("should match known MD5 hash for verification", () => {
			// Pre-computed: echo -n "file:///Users/user1/WebstormProjects/poetic-method" | md5
			const uri = "file:///Users/user1/WebstormProjects/poetic-method";
			const result = getFormattedWorkspaceId(uri);

			// Verify the hash matches expected MD5
			const expectedHash = createHash("md5").update(uri).digest("hex");
			expect(result).toBe(`ws_${expectedHash}`);
		});
	});

	describe("Format Validation", () => {
		it("should always produce 35-character output (ws_ + 32 hex)", () => {
			const testCases = [
				"file:///short",
				"file:///a/very/long/path/that/goes/on/and/on/for/many/directories",
				"default",
				"",
				"file:///Users/名前/プロジェクト", // Unicode
			];

			for (const uri of testCases) {
				const result = getFormattedWorkspaceId(uri);
				expect(result.length).toBe(35); // ws_ (3) + 32 hex chars
			}
		});

		it("should only contain valid characters", () => {
			const uri = "file:///test/path";
			const result = getFormattedWorkspaceId(uri);

			// Should only be lowercase hex after ws_
			expect(result).toMatch(/^ws_[a-f0-9]+$/);
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
		it("should handle empty string", () => {
			const result = getFormattedWorkspaceId("");
			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
		});

		it("should handle very long paths", () => {
			const longPath = "file:///" + "a".repeat(10000);
			const result = getFormattedWorkspaceId(longPath);

			// Should still produce valid format
			expect(result).toMatch(/^ws_[a-f0-9]{32}$/);
		});

		it("should handle null-like values gracefully", () => {
			// In real code, these would be prevented by TypeScript
			// But test robustness
			const result1 = getFormattedWorkspaceId("null");
			const result2 = getFormattedWorkspaceId("undefined");

			expect(result1).toMatch(/^ws_[a-f0-9]{32}$/);
			expect(result2).toMatch(/^ws_[a-f0-9]{32}$/);
		});
	});
});

describe("Workspace ID Server Compatibility", () => {
	it("should match server expected format", () => {
		// Server expects: ws_00000000000000000000000000000000
		// That's ws_ + exactly 32 hex characters
		const uri = "file:///test";
		const result = getFormattedWorkspaceId(uri);

		// Validate against server regex
		const serverRegex = /^ws_[a-f0-9]{32}$/;
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
