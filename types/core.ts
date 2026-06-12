/**
 * Core Types - Local definitions for thin client architecture
 *
 * Replaces @vreko/core type imports.
 */

export interface ServiceFederation {
	get<T>(serviceId: string): T | undefined;
	register<T>(serviceId: string, service: T): void;
	has(serviceId: string): boolean;
}

export interface AIConfidenceDisplay {
	level: string;
	confidence: number;
	description: string;
}

export type CelebrationTier = "none" | "subtle" | "standard" | "grand";

export interface RecoveryEvent {
	type: string;
	timestamp: number;
	snapshotId?: string;
	filesRecovered?: number;
}
