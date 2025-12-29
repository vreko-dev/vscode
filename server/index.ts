/**
 * SnapBack Language Server
 *
 * Handles heavy compute operations in a separate process to keep the extension lightweight.
 * This is the key to bundle optimization - all @snapback/intelligence imports are here.
 *
 * Supported Custom Requests:
 * - snapback/validate - 7-layer validation pipeline
 * - snapback/vitals - Workspace vitals snapshot
 * - snapback/vitals/full - Full vitals with methods for caching
 * - snapback/intelligence/get - Create/get Intelligence instance
 * - snapback/intelligence/detectFrameworks - Detect workspace frameworks
 * - snapback/intelligence/detectPrimaryFramework - Get primary framework
 * - snapback/intelligence/detectPatterns - Pattern detection
 * - snapback/intelligence/reportViolation - Report violation for learning
 * - snapback/intelligence/getLearningStats - Get learning statistics
 * - snapback/intelligence/recordModification - Record file modification to session
 * - snapback/intelligence/getModifications - Get file modifications for session
 *
 * @module server
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Heavy packages - only loaded in server process (NOT in extension bundle)
import {
	type DetectedFramework,
	type FrameworkDetectionContext,
	Intelligence,
	type IntelligenceConfig,
	detectFrameworks as intelligenceDetectFrameworks,
	detectPrimaryFramework as intelligenceDetectPrimaryFramework,
	type PipelineResult,
	ValidationPipeline,
} from "@snapback/intelligence";
import { type VitalsSnapshot, WorkspaceVitals } from "@snapback/intelligence/vitals";
import {
	type Connection,
	createConnection,
	type InitializeParams,
	type InitializeResult,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

// Create LSP connection using stdio
const connection: Connection = createConnection(ProposedFeatures.all);

// Create text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Cache for workspace-level services
let workspaceRoot: string | undefined;
let validationPipeline: ValidationPipeline | undefined;
let workspaceVitals: WorkspaceVitals | undefined;

// Cache for Intelligence instances (keyed by workspace URI)
const intelligenceInstances = new Map<string, Intelligence>();

/**
 * Initialize server capabilities
 */
connection.onInitialize((params: InitializeParams): InitializeResult => {
	workspaceRoot = params.rootUri ? params.rootUri.replace("file://", "") : undefined;

	connection.console.log(`SnapBack Language Server initialized for: ${workspaceRoot || "unknown"}`);

	// Initialize workspace services lazily
	if (workspaceRoot) {
		workspaceVitals = WorkspaceVitals.for(workspaceRoot);
	}

	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Custom capabilities for SnapBack features
			// Will be used for semantic search, validation, context analysis
		},
	};
});

connection.onInitialized(() => {
	connection.console.log("SnapBack Language Server ready");
});

/**
 * Custom: Semantic validation request
 * Uses ValidationPipeline from @snapback/intelligence
 */
connection.onRequest("snapback/validate", async (params: { code: string; filePath: string }) => {
	if (!validationPipeline && workspaceRoot) {
		validationPipeline = new ValidationPipeline({ workspaceRoot, enhanced: false });
	}

	if (!validationPipeline) {
		return { error: "Workspace not initialized" };
	}

	try {
		const result = await validationPipeline.validate(params.code, params.filePath);
		return { success: true, result };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: message };
	}
});

/**
 * Custom: Workspace vitals request
 * Uses WorkspaceVitals from @snapback/intelligence
 */
connection.onRequest("snapback/vitals", async () => {
	if (!workspaceVitals) {
		return { error: "Workspace not initialized" };
	}

	try {
		const vitals = workspaceVitals.current();
		const guidance = workspaceVitals.getAgentGuidance();
		const snapshotDecision = workspaceVitals.shouldSnapshot();

		return {
			success: true,
			vitals,
			guidance,
			snapshotDecision,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: message };
	}
});

// =============================================================================
// INTELLIGENCE HANDLERS
// =============================================================================

/**
 * Helper: Create Intelligence config for workspace
 */
function createIntelligenceConfig(wsRoot: string): IntelligenceConfig {
	const snapbackDir = path.join(wsRoot, ".snapback");
	return {
		rootDir: snapbackDir,
		patternsDir: "patterns",
		learningsDir: "learnings",
		constraintsFile: "constraints.md",
		violationsFile: "patterns/violations.jsonl",
		embeddingsDb: "embeddings.db",
		contextFiles: ["patterns/workspace-patterns.json", "vitals.json", "constraints.md"],
		enableSemanticSearch: false,
		enableLearningLoop: true,
		enableAutoPromotion: true,
		sessionPersistence: {
			path: path.join(wsRoot, ".snapback", "session", "sessions.jsonl"),
			autosave: true,
		},
	};
}

/**
 * Helper: Get or create Intelligence instance
 */
function getOrCreateIntelligence(workspaceUri: string, wsRoot: string): Intelligence {
	if (!intelligenceInstances.has(workspaceUri)) {
		const config = createIntelligenceConfig(wsRoot);
		const intel = new Intelligence(config);
		intelligenceInstances.set(workspaceUri, intel);
	}
	return intelligenceInstances.get(workspaceUri)!;
}

/**
 * Get or create Intelligence instance
 */
connection.onRequest("snapback/intelligence/get", async (params: { workspaceUri: string; workspaceRoot?: string }) => {
	const wsRoot = params.workspaceRoot || workspaceRoot;
	if (!wsRoot) {
		return { success: false, error: "No workspace root available" };
	}

	try {
		const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
		return { success: true, initialized: !!intel };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { success: false, error: message };
	}
});

/**
 * Helper: Build framework detection context
 */
async function buildFrameworkContext(wsRoot: string): Promise<FrameworkDetectionContext> {
	const packageJsonPath = path.join(wsRoot, "package.json");
	let packageJson: FrameworkDetectionContext["packageJson"];

	try {
		const content = await fs.promises.readFile(packageJsonPath, "utf-8");
		packageJson = JSON.parse(content);
	} catch {
		// No package.json or invalid - that's ok
	}

	const filePaths: string[] = [];
	try {
		const entries = await fs.promises.readdir(wsRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				filePaths.push(entry.name);
			} else if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
				filePaths.push(`${entry.name}/`);
			}
		}
	} catch {
		// Can't read directory
	}

	return { packageJson, filePaths };
}

/**
 * Detect frameworks in workspace
 */
connection.onRequest(
	"snapback/intelligence/detectFrameworks",
	async (params: {
		workspaceRoot?: string;
	}): Promise<{ success: boolean; frameworks?: DetectedFramework[]; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const context = await buildFrameworkContext(wsRoot);
			const frameworks = await intelligenceDetectFrameworks(context);
			return { success: true, frameworks };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Detect primary framework
 */
connection.onRequest(
	"snapback/intelligence/detectPrimaryFramework",
	async (params: {
		workspaceRoot?: string;
	}): Promise<{ success: boolean; framework?: DetectedFramework | null; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const context = await buildFrameworkContext(wsRoot);
			const framework = await intelligenceDetectPrimaryFramework(context);
			return { success: true, framework };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Validate code using Intelligence pipeline
 */
connection.onRequest(
	"snapback/intelligence/validateCode",
	async (params: {
		code: string;
		filePath: string;
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{ success: boolean; result?: PipelineResult; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			const result = await intel.validateCode(params.code, params.filePath);
			return { success: true, result };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Detect patterns in code
 */
connection.onRequest(
	"snapback/intelligence/detectPatterns",
	async (params: {
		code: string;
		filePath: string;
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{ success: boolean; result?: PipelineResult; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			const result = await intel.checkPatterns(params.code, params.filePath);
			return { success: true, result };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Report violation for learning
 */
connection.onRequest(
	"snapback/intelligence/reportViolation",
	async (params: {
		violation: {
			type: string;
			file: string;
			message: string;
			reason: string;
			prevention: string;
		};
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{ success: boolean; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			await intel.reportViolation(params.violation);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Get learning statistics
 */
connection.onRequest(
	"snapback/intelligence/getLearningStats",
	async (params: {
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{ success: boolean; stats?: ReturnType<Intelligence["getStats"]>; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			const stats = intel.getStats();
			return { success: true, stats };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Record file modification to session
 */
connection.onRequest(
	"snapback/intelligence/recordModification",
	async (params: {
		sessionId: string;
		modification: {
			path: string;
			timestamp: number;
			type: "create" | "update" | "delete";
			linesChanged?: number;
		};
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{ success: boolean; error?: string }> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			intel.recordFileModification(params.sessionId, params.modification);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Get file modifications for session
 */
connection.onRequest(
	"snapback/intelligence/getModifications",
	async (params: {
		sessionId: string;
		since?: number;
		workspaceUri: string;
		workspaceRoot?: string;
	}): Promise<{
		success: boolean;
		modifications?: Array<{
			path: string;
			timestamp: number;
			type: "create" | "update" | "delete";
			linesChanged: number;
			aiAttributed: boolean;
		}>;
		error?: string;
	}> => {
		const wsRoot = params.workspaceRoot || workspaceRoot;
		if (!wsRoot) {
			return { success: false, error: "No workspace root available" };
		}

		try {
			const intel = getOrCreateIntelligence(params.workspaceUri, wsRoot);
			const modifications = intel.getFileModifications(params.sessionId, params.since);
			return { success: true, modifications };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

/**
 * Get full vitals snapshot for caching (includes threshold multiplier)
 */
connection.onRequest(
	"snapback/vitals/full",
	async (params: {
		workspaceId?: string;
	}): Promise<{
		success: boolean;
		vitals?: VitalsSnapshot;
		thresholdMultiplier?: number;
		error?: string;
	}> => {
		const wsId = params.workspaceId || workspaceRoot;
		if (!wsId) {
			return { success: false, error: "No workspace ID available" };
		}

		try {
			const vitals = WorkspaceVitals.for(wsId);
			return {
				success: true,
				vitals: vitals.current(),
				thresholdMultiplier: vitals.getThresholdMultiplier(),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	},
);

// =============================================================================
// VITALS NOTIFICATION HANDLERS (for WorkspaceVitalsProxy)
// =============================================================================

/**
 * Handle file change notification from extension
 */
connection.onRequest(
	"snapback/vitals/onFileChange",
	async (params: {
		workspaceId: string;
		path: string;
		isAI: boolean;
		tool?: string;
	}): Promise<{ success: boolean }> => {
		try {
			const vitals = WorkspaceVitals.for(params.workspaceId);
			vitals.onFileChange({
				path: params.path,
				isAI: params.isAI,
				tool: params.tool,
			});
			return { success: true };
		} catch {
			return { success: false };
		}
	},
);

/**
 * Handle snapshot notification from extension
 */
connection.onRequest(
	"snapback/vitals/onSnapshot",
	async (params: { workspaceId: string; filePath: string }): Promise<{ success: boolean }> => {
		try {
			const vitals = WorkspaceVitals.for(params.workspaceId);
			vitals.onSnapshot({ filePath: params.filePath });
			return { success: true };
		} catch {
			return { success: false };
		}
	},
);

/**
 * Handle behavior recording from extension
 */
connection.onRequest(
	"snapback/vitals/recordBehavior",
	async (params: { workspaceId: string; created: boolean }): Promise<{ success: boolean }> => {
		try {
			const vitals = WorkspaceVitals.for(params.workspaceId);
			vitals.recordBehavior(params.created);
			return { success: true };
		} catch {
			return { success: false };
		}
	},
);

/**
 * 🆕 Phase 2A: Handle edit recording from extension
 */
connection.onRequest(
	"snapback/vitals/recordEdit",
	async (params: {
		workspaceId: string;
		linesAdded: number;
		linesDeleted: number;
	}): Promise<{ success: boolean }> => {
		try {
			const vitals = WorkspaceVitals.for(params.workspaceId);
			vitals.recordEdit(params.linesAdded, params.linesDeleted);
			return { success: true };
		} catch {
			return { success: false };
		}
	},
);

// Listen to text document events
documents.listen(connection);

// Start listening for LSP messages
connection.listen();
