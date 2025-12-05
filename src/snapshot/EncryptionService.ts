import {
	createCipheriv,
	createDecipheriv,
	createHash,
	pbkdf2Sync,
	randomBytes,
} from "node:crypto";
import { machineIdSync } from "node-machine-id";
import type { VSCodeTelemetry } from "../telemetry";
import { logger } from "../utils/logger";

export interface EncryptedData {
	ciphertext: string;
	iv: string;
	authTag: string;
	algorithm: "aes-256-gcm";
}

/**
 * Encryption service for snapshot data using device-specific keys
 *
 * Key Derivation: Machine ID → PBKDF2 (100k iterations) → AES-256 Key
 * Encryption: AES-256-GCM with random IV per snapshot
 */
export class EncryptionService {
	private deviceKey: Buffer;
	private readonly ALGORITHM = "aes-256-gcm";
	private readonly KEY_LENGTH = 32; // 256 bits
	private readonly IV_LENGTH = 16; // 128 bits
	private readonly PBKDF2_ITERATIONS = 100000; // As recommended in audit
	private readonly SALT = Buffer.from("snapback-v1-salt"); // Version-specific salt
	private telemetry: VSCodeTelemetry | null = null;

	constructor() {
		try {
			// Derive device-specific encryption key
			const machineId = machineIdSync(true);

			// PBKDF2 with 100,000 iterations for key stretching
			this.deviceKey = pbkdf2Sync(
				machineId,
				this.SALT,
				this.PBKDF2_ITERATIONS,
				this.KEY_LENGTH,
				"sha256",
			);

			logger.info("Encryption service initialized", {
				algorithm: this.ALGORITHM,
				keyLength: this.KEY_LENGTH * 8,
				iterations: this.PBKDF2_ITERATIONS,
			});
		} catch (error) {
			logger.error("Failed to initialize encryption service", error as Error);
			throw new Error("Encryption initialization failed");
		}
	}

	/**
	 * Encrypt plaintext data using AES-256-GCM
	 *
	 * @param plaintext Data to encrypt (typically JSON stringified snapshot)
	 * @returns Encrypted data with IV and authentication tag
	 */
	encrypt(plaintext: string): EncryptedData {
		try {
			// Generate random IV for this encryption operation
			const iv = randomBytes(this.IV_LENGTH);

			// Create cipher with device key and IV
			const cipher = createCipheriv(this.ALGORITHM, this.deviceKey, iv);

			// Encrypt data
			const encrypted = Buffer.concat([
				cipher.update(plaintext, "utf8"),
				cipher.final(),
			]);

			// Get authentication tag (GCM mode provides authenticity)
			const authTag = cipher.getAuthTag();

			return {
				ciphertext: encrypted.toString("base64"),
				iv: iv.toString("base64"),
				authTag: authTag.toString("base64"),
				algorithm: this.ALGORITHM,
			};
		} catch (error) {
			logger.error("Encryption failed", error as Error);
			this.telemetry?.trackError(
				"snapshot.encryption.failed",
				"Failed to encrypt snapshot data",
			);
			throw new Error("Failed to encrypt snapshot data");
		}
	}

	/**
	 * Decrypt encrypted data using AES-256-GCM
	 *
	 * @param encrypted Encrypted data with IV and auth tag
	 * @returns Decrypted plaintext
	 * @throws Error if authentication fails (tampered data)
	 */
	decrypt(encrypted: EncryptedData): string {
		try {
			// Validate algorithm
			if (encrypted.algorithm !== this.ALGORITHM) {
				throw new Error(`Unsupported algorithm: ${encrypted.algorithm}`);
			}

			// Create decipher with device key and stored IV
			const decipher = createDecipheriv(
				this.ALGORITHM,
				this.deviceKey,
				Buffer.from(encrypted.iv, "base64"),
			);

			// Set authentication tag for GCM verification
			decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

			// Decrypt data
			const decrypted = Buffer.concat([
				decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
				decipher.final(), // Will throw if authentication fails
			]);

			return decrypted.toString("utf8");
		} catch (error) {
			if (
				(error as Error).message.includes(
					"Unsupported state or unable to authenticate",
				)
			) {
				logger.error(
					"Decryption failed: authentication error (tampered data?)",
				);
				this.telemetry?.trackError(
					"snapshot.decryption.failed",
					"Snapshot authentication failed - data may be tampered",
				);
				throw new Error(
					"Snapshot authentication failed - data may be tampered",
				);
			}

			logger.error("Decryption failed", error as Error);
			this.telemetry?.trackError(
				"snapshot.decryption.failed",
				"Failed to decrypt snapshot data",
			);
			throw new Error("Failed to decrypt snapshot data");
		}
	}

	/**
	 * Compute content hash for deduplication (post-encryption)
	 *
	 * @param content Original plaintext content
	 * @returns SHA-256 hash for deduplication
	 */
	computeContentHash(content: string): string {
		return createHash("sha256").update(content).digest("hex");
	}

	setTelemetry(telemetry: VSCodeTelemetry) {
		this.telemetry = telemetry;
	}

	/**
	 * Test encryption/decryption roundtrip
	 */
	async testRoundtrip(): Promise<boolean> {
		try {
			const testData = "SnapBack encryption test";
			const encrypted = this.encrypt(testData);
			const decrypted = this.decrypt(encrypted);

			return testData === decrypted;
		} catch {
			return false;
		}
	}
}
