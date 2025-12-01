/**
 * VS Code test helpers for SnapBack extension testing
 * Provides utilities for setting up and managing VS Code API mocks
 */

import { afterEach, beforeEach, vi } from "vitest";
import type * as vscode from "vscode";

// Type definitions for mock objects
export interface MockExtensionContext {
	subscriptions: vscode.Disposable[];
	workspaceState: MockMemento;
	globalState: MockMemento;
	secrets: MockSecretStorage;
	extensionUri: vscode.Uri;
	extensionPath: string;
	storagePath: string;
	globalStoragePath: string;
	logPath: string;
	extensionMode: vscode.ExtensionMode;
	environment: {
		appName: string;
		appRoot: string;
		language: string;
		sessionId: string;
		machineId: string;
	};
}

export interface MockMemento {
	storage: Map<string, unknown>;
	get<T>(key: string, defaultValue?: T): T;
	update(key: string, value: unknown): Promise<void>;
	keys(): readonly string[];
}

export interface MockSecretStorage {
	secrets: Map<string, string>;
	onDidChange: vscode.Event<{ key: string } | undefined>;
	get(key: string): Promise<string | undefined>;
	store(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface MockTreeDataProvider<T> {
	data: T[];
	_onDidChangeTreeData: {
		fire: (data?: T | null) => void;
		event: vscode.Event<T | undefined | null>;
	};
	onDidChangeTreeData: vscode.Event<T | undefined | null>;
	getTreeItem(element: T): vscode.TreeItem | Promise<vscode.TreeItem>;
	getChildren(element?: T): Promise<T[]>;
	refresh(): void;
}

export interface MockWebviewView {
	webview: {
		html: string;
		options: unknown;
		cspSource: string;
		asWebviewUri: (uri: vscode.Uri) => vscode.Uri;
		postMessage: (...args: unknown[]) => unknown;
		onDidReceiveMessage: (handler: (message: unknown) => void) => void;
	};
	visible: boolean;
	viewType: string;
	title: string;
	description: string;
	onDidDispose: () => void;
	onDidChangeVisibility: (handler: (visibility: boolean) => void) => void;
	show(preserveFocus?: boolean): void;
	dispose(): void;
}

/**
 * VS Code mock factory for creating consistent test environments
 */
export class VSCodeMockFactory {
	private static instance: VSCodeMockFactory;
	private mocks: Map<string, unknown> = new Map();

	static getInstance(): VSCodeMockFactory {
		if (!VSCodeMockFactory.instance) {
			VSCodeMockFactory.instance = new VSCodeMockFactory();
		}
		return VSCodeMockFactory.instance;
	}

	/**
	 * Create a mock extension context with realistic defaults
	 */
	createExtensionContext(
		overrides: Partial<MockExtensionContext> = {},
	): MockExtensionContext {
		const mockContext = {
			subscriptions: [],
			workspaceState: this.createMemento(),
			globalState: this.createMemento(),
			secrets: this.createSecretStorage(),
			extensionUri: {
				scheme: "file",
				path: "/test/extension",
			} as vscode.Uri,
			extensionPath: "/test/extension",
			storagePath: "/test/storage",
			globalStoragePath: "/test/global-storage",
			logPath: "/test/logs",
			extensionMode: 1 as vscode.ExtensionMode, // Development
			environment: {
				appName: "Visual Studio Code - Test",
				appRoot: "/test/vscode",
				language: "en",
				sessionId: "test-session-id",
				machineId: "test-machine-id",
			},
			...overrides,
		};

		this.mocks.set("extensionContext", mockContext);
		return mockContext;
	}

	/**
	 * Create a mock memento for state management testing
	 */
	createMemento(initialData: Record<string, unknown> = {}): MockMemento {
		const storage = new Map(Object.entries(initialData));

		return {
			storage,
			get<T>(key: string, defaultValue?: T): T {
				return (storage.get(key) ?? defaultValue) as T;
			},
			async update(key: string, value: unknown): Promise<void> {
				storage.set(key, value);
			},
			keys(): readonly string[] {
				return Array.from(storage.keys());
			},
		};
	}

	/**
	 * Create a mock secret storage for secure data testing
	 */
	createSecretStorage(
		initialSecrets: Record<string, string> = {},
	): MockSecretStorage {
		const secrets = new Map(Object.entries(initialSecrets));

		return {
			secrets,
			onDidChange: vi.fn(),
			async get(key: string): Promise<string | undefined> {
				return secrets.get(key);
			},
			async store(key: string, value: string): Promise<void> {
				secrets.set(key, value);
			},
			async delete(key: string): Promise<void> {
				secrets.delete(key);
			},
		};
	}

	/**
	 * Create a mock tree data provider for tree view testing
	 */
	createTreeDataProvider<T>(initialData: T[] = []): MockTreeDataProvider<T> {
		const mockEmitter = {
			fire: vi.fn(),
			event: vi.fn(),
		};

		return {
			data: initialData,
			_onDidChangeTreeData: mockEmitter,
			onDidChangeTreeData: mockEmitter.event,
			getTreeItem(element: T): vscode.TreeItem {
				return element as vscode.TreeItem;
			},
			async getChildren(element?: T): Promise<T[]> {
				if (!element) {
					return this.data;
				}
				return (element as { children?: T[] }).children || [];
			},
			refresh(): void {
				mockEmitter.fire();
			},
		};
	}

	/**
	 * Create a mock webview view for webview testing
	 */
	createWebviewView(viewType = "test-view"): MockWebviewView {
		return {
			webview: {
				html: "",
				options: {},
				cspSource: "vscode-resource:",
				asWebviewUri: vi.fn((uri) => uri),
				postMessage: vi.fn(),
				onDidReceiveMessage: vi.fn(),
			},
			visible: true,
			viewType,
			title: "",
			description: "",
			onDidDispose: vi.fn(),
			onDidChangeVisibility: vi.fn(),
			show(_preserveFocus?: boolean): void {
				this.visible = true;
			},
			dispose(): void {
				this.visible = false;
				if (this.onDidDispose) {
					this.onDidDispose();
				}
			},
		};
	}

	/**
	 * Create a mock text document for document testing
	 */
	createTextDocument(uri: vscode.Uri, content = "", languageId = "typescript") {
		return {
			uri,
			fileName: uri.path,
			isUntitled: false,
			languageId,
			version: 1,
			isDirty: false,
			isClosed: false,
			eol: 1, // EndOfLine.LF
			lineCount: content.split("\n").length,
			save: vi.fn().mockResolvedValue(true),
			getText: vi.fn().mockReturnValue(content),
			getWordRangeAtPosition: vi.fn().mockReturnValue(null),
			validateRange: vi.fn((range) => range),
			validatePosition: vi.fn((position) => position),
			offsetAt: vi.fn().mockReturnValue(0),
			positionAt: vi.fn().mockReturnValue({ line: 0, character: 0 }),
			lineAt: vi.fn().mockReturnValue({
				lineNumber: 0,
				text: "",
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
				rangeIncludingLineBreak: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
				firstNonWhitespaceCharacterIndex: 0,
				isEmptyOrWhitespace: true,
			}),
		};
	}

	/**
	 * Create a mock workspace folder for workspace testing
	 */
	createWorkspaceFolder(name: string, uri: vscode.Uri, index = 0) {
		return {
			uri,
			name,
			index,
		};
	}

	/**
	 * Set up mock workspace with folders and files
	 */
	setupMockWorkspace(folders: Array<{ name: string; path: string }> = []) {
		const workspaceFolders = folders.map((folder, index) =>
			this.createWorkspaceFolder(
				folder.name,
				{ scheme: "file", path: folder.path } as vscode.Uri,
				index,
			),
		);

		// Update workspace mock
		const vscode = require("vscode");
		vscode.workspace.workspaceFolders = workspaceFolders;
		vscode.workspace.name =
			folders.length > 0 ? folders[0].name : "Test Workspace";

		return workspaceFolders;
	}

	/**
	 * Simulate file system events for testing
	 */
	simulateFileEvent(
		eventType: "create" | "change" | "delete",
		uri: vscode.Uri,
	) {
		const vscode = require("vscode");

		switch (eventType) {
			case "create":
				vscode.workspace.onDidCreateFiles?.fire({ files: [{ uri }] });
				break;
			case "change":
				vscode.workspace.onDidSaveTextDocument?.fire(
					this.createTextDocument(uri),
				);
				break;
			case "delete":
				vscode.workspace.onDidDeleteFiles?.fire({ files: [{ uri }] });
				break;
		}
	}

	/**
	 * Simulate command execution
	 */
	simulateCommandExecution(command: string, ...args: unknown[]): unknown {
		const vscode = require("vscode");
		return vscode.commands.executeCommand(command, ...args);
	}

	/**
	 * Reset all mocks to initial state
	 */
	reset(): void {
		this.mocks.clear();
		vi.clearAllMocks();
	}

	/**
	 * Get a stored mock by key
	 */
	getMock<T>(key: string): T | undefined {
		return this.mocks.get(key) as T | undefined;
	}
}

/**
 * Test setup helper for consistent test environment
 */
export function setupVSCodeMocks() {
	const factory = VSCodeMockFactory.getInstance();

	beforeEach(() => {
		factory.reset();

		// Reset VS Code API mocks
		const vscode = require("vscode");

		// Reset window mocks
		vscode.window.showInformationMessage.mockClear();
		vscode.window.showWarningMessage.mockClear();
		vscode.window.showErrorMessage.mockClear();
		vscode.window.createStatusBarItem.mockClear();
		vscode.window.createTreeView.mockClear();
		vscode.window.registerTreeDataProvider.mockClear();
		vscode.window.registerWebviewViewProvider.mockClear();

		// Reset workspace mocks
		vscode.workspace.getConfiguration.mockClear();
		vscode.workspace.findFiles.mockClear();
		vscode.workspace.openTextDocument.mockClear();

		// Reset commands mocks
		vscode.commands.registerCommand.mockClear();
		vscode.commands.executeCommand.mockClear();
	});

	afterEach(() => {
		factory.reset();
	});

	return factory;
}

/**
 * Performance testing utilities
 */
export class PerformanceTestHelper {
	private startTime = 0;
	private markers: Map<string, number> = new Map();

	startTimer(): void {
		this.startTime = performance.now();
	}

	markTime(label: string): void {
		this.markers.set(label, performance.now());
	}

	getElapsedTime(fromStart = true): number {
		const currentTime = performance.now();
		return fromStart ? currentTime - this.startTime : currentTime;
	}

	getMarkerTime(label: string): number | undefined {
		const markerTime = this.markers.get(label);
		return markerTime ? markerTime - this.startTime : undefined;
	}

	getDuration(startLabel: string, endLabel: string): number | undefined {
		const startTime = this.markers.get(startLabel);
		const endTime = this.markers.get(endLabel);
		return startTime && endTime ? endTime - startTime : undefined;
	}

	reset(): void {
		this.startTime = 0;
		this.markers.clear();
	}

	createPerformanceAssertion(thresholdMs: number) {
		return (actualMs: number) => {
			if (actualMs > thresholdMs) {
				throw new Error(
					`Performance threshold exceeded: ${actualMs}ms > ${thresholdMs}ms`,
				);
			}
		};
	}
}

/**
 * Memory testing utilities
 */
export class MemoryTestHelper {
	private initialMemory: NodeJS.MemoryUsage;

	constructor() {
		this.initialMemory = process.memoryUsage();
	}

	takeSnapshot(): NodeJS.MemoryUsage {
		return process.memoryUsage();
	}

	getMemoryDelta(snapshot?: NodeJS.MemoryUsage): NodeJS.MemoryUsage {
		const current = snapshot || process.memoryUsage();
		return {
			rss: current.rss - this.initialMemory.rss,
			heapTotal: current.heapTotal - this.initialMemory.heapTotal,
			heapUsed: current.heapUsed - this.initialMemory.heapUsed,
			external: current.external - this.initialMemory.external,
			arrayBuffers: current.arrayBuffers - this.initialMemory.arrayBuffers,
		};
	}

	createMemoryAssertion(maxIncreaseMB: number) {
		return (delta: NodeJS.MemoryUsage) => {
			const heapIncreaseMB = delta.heapUsed / (1024 * 1024);
			if (heapIncreaseMB > maxIncreaseMB) {
				throw new Error(
					`Memory usage exceeded threshold: ${heapIncreaseMB}MB > ${maxIncreaseMB}MB`,
				);
			}
		};
	}

	forceGarbageCollection(): void {
		if (global.gc) {
			global.gc();
		}
	}
}

/**
 * Event simulation utilities
 */

export function simulateFileChange(uri: vscode.Uri, content?: string) {
	const vscode = require("vscode");
	const document = VSCodeMockFactory.getInstance().createTextDocument(
		uri,
		content,
	);

	// Simulate file change events
	vscode.workspace.onDidChangeTextDocument?.fire({
		document,
		contentChanges: [
			{
				range: new vscode.Range(0, 0, 0, 0),
				rangeLength: 0,
				text: content || "",
			},
		],
	});

	return document;
}

export function simulateConfigurationChange(_affectedSection?: string) {
	const vscode = require("vscode");
	vscode.workspace.onDidChangeConfiguration?.fire({
		affectsConfiguration: vi.fn().mockReturnValue(true),
	});
}

export function simulateWorkspaceFolderChange(
	added: vscode.WorkspaceFolder[] = [],
	removed: vscode.WorkspaceFolder[] = [],
) {
	const vscode = require("vscode");
	vscode.workspace.onDidChangeWorkspaceFolders?.fire({
		added,
		removed,
	});
}

export function simulateExtensionActivation(context: MockExtensionContext) {
	// Simulate typical extension activation sequence
	return Promise.resolve(context);
}

// Export commonly used constants
export const TEST_CONSTANTS = {
	PERFORMANCE_THRESHOLDS: {
		EXTENSION_ACTIVATION: 200, // ms
		NOTIFICATION_DISPLAY: 50, // ms
		VIEW_REFRESH: 100, // ms
		CHECKPOINT_CREATION: 500, // ms
		STATE_UPDATE: 25, // ms
	},

	MEMORY_LIMITS: {
		MAX_NOTIFICATIONS: 50,
		MAX_RECENT_FILES: 10,
		MAX_OPERATIONS: 20,
		MAX_HEAP_INCREASE_MB: 50,
	},

	TEST_WORKSPACE: {
		FOLDERS: [
			{ name: "test-workspace", path: "/test/workspace" },
			{ name: "nested-project", path: "/test/workspace/nested" },
		],
	},
} as const;
