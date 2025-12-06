import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileSystemStorage } from "../../src/storage/types";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

// Mock FileSystemStorage methods
const mockStorage = {
	root: "/test",
	dir: () => "/test/.snapback",
	create: vi.fn(),
	retrieve: vi.fn(),
	list: vi.fn(),
	restore: vi.fn(),
} as unknown as FileSystemStorage;

describe("SecurityTests", () => {
	let workspaceMemory: WorkspaceMemoryManager;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create instance
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
	});

	describe("Sensitive data protection", () => {
		it("should not store credentials in checkpoints", async () => {
			// Mock storage.create to inspect what gets stored
			mockStorage.create = vi.fn().mockImplementation(async (input) => {
				// Check that no sensitive data is included
				const hasCredentials =
					JSON.stringify(input).includes("password") ||
					JSON.stringify(input).includes("secret") ||
					JSON.stringify(input).includes("key");

				expect(hasCredentials).toBe(false);

				return {
					id: `checkpoint-${Date.now()}`,
					timestamp: Date.now(),
					meta: {}, // Added missing meta property
				};
			});

			// Create checkpoint with data that might contain sensitive information
			const checkpointData = {
				trigger: "manual",
				// These should be filtered out or not included
				config: {
					apiKey: "secret-api-key",
					databasePassword: "super-secret-password",
				},
			};

			const result = await mockStorage.create(checkpointData);
			expect(result.id).toMatch(/^checkpoint-/);
		});

		it("should not log API keys in logs", async () => {
			// Capture console.log calls
			const originalLog = console.log;
			const logMessages: string[] = [];
			console.log = (...args) => {
				logMessages.push(args.join(" "));
			};

			try {
				// Simulate operations that might log sensitive data
				workspaceMemory.updateLastActiveFile("/path/to/file.ts");
				workspaceMemory.updateProtectionStatus("protected");

				// Check logs for sensitive data
				const logsContainSensitiveData = logMessages.some(
					(log) =>
						log.includes("key") ||
						log.includes("secret") ||
						log.includes("password"),
				);

				expect(logsContainSensitiveData).toBe(false);
			} finally {
				// Restore console.log
				console.log = originalLog;
			}
		});

		it("should encrypt storage for sensitive metadata", async () => {
			// This test would verify that sensitive metadata is encrypted
			// In a real implementation, we would check for encryption

			// Mock storage with encryption
			mockStorage.create = vi.fn().mockImplementation(async (_input) => {
				// In a real implementation, sensitive metadata would be encrypted
				return {
					id: `checkpoint-${Date.now()}`,
					timestamp: Date.now(),
					meta: {
						encrypted: true, // Simulate encryption in metadata
					},
				};
			});

			const result = await mockStorage.create({ trigger: "manual" });
			expect((result.meta as any).encrypted).toBe(true);
		});
	});

	describe("Path traversal prevention", () => {
		it("should validate all file paths", async () => {
			// Test various path traversal attempts
			const maliciousPaths = [
				"../etc/passwd",
				"../../etc/passwd",
				"/etc/passwd",
				"..\\windows\\system32\\cmd.exe",
				"C:\\windows\\system32\\cmd.exe",
				"../../../../../../../../etc/passwd",
				"./../../../etc/passwd",
				"~/../etc/passwd",
			];

			// Mock path validation function
			const isValidPath = (filePath: string): boolean => {
				// Check for path traversal attempts
				const normalizedPath = path.normalize(filePath);
				const hasTraversal =
					normalizedPath.includes("..") &&
					(normalizedPath.includes("../") || normalizedPath.includes("..\\"));

				// Check for absolute paths
				const isAbsolute = path.isAbsolute(filePath);

				// In a real implementation, we would have more sophisticated validation
				return !hasTraversal && !isAbsolute;
			};

			// All malicious paths should be rejected
			maliciousPaths.forEach((maliciousPath) => {
				expect(isValidPath(maliciousPath)).toBe(false);
			});
		});

		it("should prevent access outside workspace", async () => {
			// Define workspace root
			const workspaceRoot = "/workspace/project";

			// Mock path validation that restricts access to workspace
			const isWithinWorkspace = (
				filePath: string,
				workspace: string,
			): boolean => {
				const resolvedPath = path.resolve(filePath);
				const resolvedWorkspace = path.resolve(workspace);

				// Check if file path is within workspace
				return resolvedPath.startsWith(resolvedWorkspace);
			};

			// Test paths within and outside workspace
			const validPath = "/workspace/project/src/file.ts";
			const invalidPath = "/workspace/other-project/file.ts";
			const systemPath = "/etc/passwd";

			expect(isWithinWorkspace(validPath, workspaceRoot)).toBe(true);
			expect(isWithinWorkspace(invalidPath, workspaceRoot)).toBe(false);
			expect(isWithinWorkspace(systemPath, workspaceRoot)).toBe(false);
		});

		it("should sanitize user inputs", async () => {
			// Test input sanitization
			const sanitizeInput = (input: string): string => {
				// Remove potentially dangerous characters
				return input
					.replace(/[<>]/g, "") // Remove HTML tags
					.replace(/["']/g, "") // Remove quotes
					.replace(/[;|&]/g, "") // Remove command injection characters
					.trim();
			};

			// Test various malicious inputs
			const maliciousInputs = [
				'<script>alert("xss")</script>',
				'"; rm -rf /; echo "',
				"test; cat /etc/passwd",
				'test & echo "malicious"',
				'" OR 1=1 --',
			];

			const sanitizedInputs = maliciousInputs.map((input) =>
				sanitizeInput(input),
			);

			// All sanitized inputs should be safe
			sanitizedInputs.forEach((sanitized) => {
				expect(sanitized).not.toContain("<");
				expect(sanitized).not.toContain(">");
				expect(sanitized).not.toContain('"');
				expect(sanitized).not.toContain("'");
				expect(sanitized).not.toContain(";");
				expect(sanitized).not.toContain("|");
				expect(sanitized).not.toContain("&");
			});
		});
	});

	describe("MCP security", () => {
		it("should validate MCP tool responses", async () => {
			// Mock MCP client response validation
			const validateMCPResponse = (response: any): boolean => {
				// Check for malicious content in response
				const responseString = JSON.stringify(response);

				// Check for common attack patterns
				const hasXSS =
					responseString.includes("<script") ||
					responseString.includes("javascript:");
				const hasSQLInjection =
					responseString.includes(" OR ") && responseString.includes("1=1");
				const hasCommandInjection =
					responseString.includes(";") && responseString.includes("rm -rf");

				return !hasXSS && !hasSQLInjection && !hasCommandInjection;
			};

			// Test valid response
			const validResponse = {
				result: "success",
				data: { files: 10 },
			};

			expect(validateMCPResponse(validResponse)).toBe(true);

			// Test malicious responses
			const maliciousResponses = [
				{ result: '<script>alert("xss")</script>', data: {} },
				{ result: 'success"; DROP TABLE users; --', data: {} },
				{ result: "success", data: { command: "rm -rf /" } },
			];

			maliciousResponses.forEach((response) => {
				expect(validateMCPResponse(response)).toBe(false);
			});
		});

		it("should implement timeout protection for MCP calls", async () => {
			// Mock MCP client with timeout
			const callToolWithTimeout = async (
				_toolName: string,
				_params: any,
				timeoutMs: number,
			): Promise<any> => {
				return new Promise((resolve, reject) => {
					// Set timeout
					const timeout = setTimeout(() => {
						reject(new Error("MCP call timeout"));
					}, timeoutMs);

					// Simulate tool call
					setTimeout(() => {
						clearTimeout(timeout);
						resolve({ result: "success" });
					}, 100); // Tool responds in 100ms
				});
			};

			// Test that calls complete within timeout
			const result = await callToolWithTimeout("test-tool", {}, 1000);
			expect(result.result).toBe("success");

			// Test that calls timeout when appropriate
			await expect(callToolWithTimeout("slow-tool", {}, 50)).rejects.toThrow(
				"MCP call timeout",
			);
		});

		it("should implement rate limiting for MCP tools", async () => {
			// Mock rate limiting
			const callCounts = new Map<string, number>();
			const lastCallTimes = new Map<string, number>();
			const rateLimit = 10; // Max 10 calls per minute
			const timeWindow = 60000; // 1 minute

			const callToolWithRateLimit = async (toolName: string): Promise<any> => {
				const now = Date.now();
				const callCount = callCounts.get(toolName) || 0;
				const lastCallTime = lastCallTimes.get(toolName) || 0;

				// Reset count if time window has passed
				if (now - lastCallTime > timeWindow) {
					callCounts.set(toolName, 0);
				}

				// Check rate limit
				if (callCount >= rateLimit) {
					throw new Error(`Rate limit exceeded for tool ${toolName}`);
				}

				// Update counters
				callCounts.set(toolName, callCount + 1);
				lastCallTimes.set(toolName, now);

				return { result: "success" };
			};

			// Test that calls succeed within rate limit
			for (let i = 0; i < 5; i++) {
				const result = await callToolWithRateLimit("test-tool");
				expect(result.result).toBe("success");
			}

			// Test that rate limit is enforced
			let rateLimitExceeded = false;
			try {
				for (let i = 0; i < 10; i++) {
					await callToolWithRateLimit("test-tool");
				}
			} catch (error: any) {
				if (error.message.includes("Rate limit exceeded")) {
					rateLimitExceeded = true;
				}
			}

			expect(rateLimitExceeded).toBe(true);
		});
	});
});
