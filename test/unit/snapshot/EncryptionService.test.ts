import { describe, expect, it } from "vitest";
import { EncryptionService } from "@vscode/snapshot/EncryptionService";

describe("EncryptionService", () => {
	it("should encrypt and decrypt data successfully", () => {
		// This test should initially fail because we haven't implemented the service correctly yet
		const service = new EncryptionService();
		const plaintext = "sensitive code content";

		const encrypted = service.encrypt(plaintext);
		const decrypted = service.decrypt(encrypted);

		expect(decrypted).toBe(plaintext);
	});

	it("should generate unique IVs for each encryption", () => {
		// This test should initially fail
		const service = new EncryptionService();
		const plaintext = "same content";

		const encrypted1 = service.encrypt(plaintext);
		const encrypted2 = service.encrypt(plaintext);

		// Same plaintext should produce different ciphertexts (different IVs)
		expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
		expect(encrypted1.iv).not.toBe(encrypted2.iv);
	});

	it("should detect tampered data", () => {
		// This test should initially fail
		const service = new EncryptionService();
		const plaintext = "original content";

		const encrypted = service.encrypt(plaintext);

		// Tamper with ciphertext
		const tampered = {
			...encrypted,
			ciphertext: `${encrypted.ciphertext.slice(0, -5)}XXXXX`,
		};

		expect(() => service.decrypt(tampered)).toThrow("authentication failed");
	});

	it("should use device-specific keys", () => {
		// This test should initially fail
		const service1 = new EncryptionService();
		const service2 = new EncryptionService();

		const plaintext = "test content";
		const encrypted = service1.encrypt(plaintext);

		// Same device should decrypt successfully
		expect(() => service2.decrypt(encrypted)).not.toThrow();
	});

	it("should compute consistent content hashes", () => {
		// This test should initially fail
		const service = new EncryptionService();
		const content = "file content";

		const hash1 = service.computeContentHash(content);
		const hash2 = service.computeContentHash(content);

		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
	});
});
