/**
 * File Health Decoration Types
 *
 * This module defines types for the file health decoration system,
 * which provides visual indicators for file protection and risk status.
 */

/**
 * File health level indicating the detected risk/health status of a file.
 *
 * - `protected`: File is protected with no detected risks (green shield 🛡)
 * - `warning`: File has moderate risk detected (yellow warning ⚠️)
 * - `risk`: File has high risk detected (red alert 🚨)
 */
export type FileHealthLevel = "protected" | "warning" | "risk";

/**
 * File health status containing all decoration-related information for a file.
 */
export interface FileHealthStatus {
	/** Absolute file path or URI string */
	uri: string;

	/** Current health level of the file */
	level: FileHealthLevel;

	/** Optional protection level (watch/warn/block) if file is protected */
	protectionLevel?: "watch" | "warn" | "block";

	/** Timestamp when this health status was last updated */
	lastUpdated: Date;
}
