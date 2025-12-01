import Ajv from "ajv";

// Define the PolicyBundle interface that matches the schema
interface PolicyRule {
	pattern: string;
	level: "watch" | "warn" | "block";
	reason?: string | null;
	autoSnapshot?: boolean | null;
	debounce?: number | null;
	precedence?: number | null;
}

export interface PolicyBundle {
	version: string;
	minClientVersion: string;
	rules: PolicyRule[];
	metadata: {
		timestamp: number;
		schemaVersion: string;
	};
}

const ajv = new Ajv({ strict: false });

export const rulesBundleSchema = {
	type: "object",
	required: ["version", "minClientVersion", "rules", "metadata"],
	properties: {
		version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
		minClientVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
		rules: {
			type: "array",
			items: {
				type: "object",
				required: ["pattern", "level"],
				properties: {
					pattern: { type: "string" },
					level: { type: "string", enum: ["watch", "warn", "block"] },
					reason: { type: "string", nullable: true },
					autoSnapshot: { type: "boolean", nullable: true },
					debounce: { type: "number", nullable: true },
					precedence: { type: "number", nullable: true },
				},
			},
		},
		metadata: {
			type: "object",
			required: ["timestamp", "schemaVersion"],
			properties: {
				timestamp: { type: "number" },
				schemaVersion: { type: "string" },
			},
		},
	},
} as const;

export const validate = ajv.compile(rulesBundleSchema);
