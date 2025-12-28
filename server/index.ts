/**
 * SnapBack Language Server
 *
 * Handles heavy compute operations in a separate process to keep the extension lightweight.
 * Lazy-loaded only when advanced features are needed (semantic search, validation, etc.)
 *
 * @module server
 */

// Heavy packages - only loaded in server process
import { ValidationPipeline } from "@snapback/intelligence";
import { WorkspaceVitals } from "@snapback/intelligence/vitals";
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

// Listen to text document events
documents.listen(connection);

// Start listening for LSP messages
connection.listen();
