import { vi } from "vitest";

// =============================================================================
// EVENT EMITTER MOCK
// =============================================================================

type Listener<T> = (e: T) => void;

export class EventEmitter<T> {
	private listeners: Listener<T>[] = [];

	get event(): (listener: Listener<T>) => { dispose: () => void } {
		return (listener: Listener<T>) => {
			this.listeners.push(listener);
			return {
				dispose: () => {
					const idx = this.listeners.indexOf(listener);
					if (idx >= 0) {
						this.listeners.splice(idx, 1);
					}
				},
			};
		};
	}

	fire(event: T): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	dispose(): void {
		this.listeners = [];
	}
}

// =============================================================================
// QUICK PICK MOCK
// =============================================================================

export const QuickPickItemKind = {
	Separator: -1,
	Default: 0,
};

function createMockQuickPick() {
	const onDidAcceptEmitter = new EventEmitter<void>();
	const onDidHideEmitter = new EventEmitter<void>();
	const onDidChangeValueEmitter = new EventEmitter<string>();
	const onDidChangeSelectionEmitter = new EventEmitter<any[]>();

	return {
		items: [] as any[],
		selectedItems: [] as any[],
		title: "",
		placeholder: "",
		value: "",
		matchOnDescription: false,
		matchOnDetail: false,
		busy: false,
		enabled: true,
		canSelectMany: false,
		onDidAccept: onDidAcceptEmitter.event,
		onDidHide: onDidHideEmitter.event,
		onDidChangeValue: onDidChangeValueEmitter.event,
		onDidChangeSelection: onDidChangeSelectionEmitter.event,
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
		// Test helpers
		_onDidAcceptEmitter: onDidAcceptEmitter,
		_onDidHideEmitter: onDidHideEmitter,
	};
}

// =============================================================================
// WINDOW MOCK
// =============================================================================

// Mock vscode module
export const window = {
	createWebviewPanel: vi.fn(),
	showInformationMessage: vi.fn(),
	showWarningMessage: vi.fn(),
	showErrorMessage: vi.fn(),
	createQuickPick: vi.fn(() => createMockQuickPick()),
	createStatusBarItem: vi.fn(() => ({
		text: "",
		tooltip: "",
		command: undefined,
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
		setPaused: vi.fn(),
		setScanning: vi.fn(),
	})),
	createOutputChannel: vi.fn(() => ({
		appendLine: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	})),
	registerFileDecorationProvider: vi.fn(),
	ViewColumn: {
		One: 1,
	},
};

export const workspace = {
	getConfiguration: vi.fn().mockReturnValue({
		get: vi.fn(),
		update: vi.fn().mockResolvedValue(undefined),
	}),
	workspaceFolders: [],
	onDidSaveTextDocument: vi.fn(),
	onDidChangeConfiguration: vi.fn(),
	fs: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
	},
};

export const ConfigurationTarget = {
	Global: 1,
	Workspace: 2,
	WorkspaceFolder: 3,
};

export const commands = {
	registerCommand: vi.fn(),
	executeCommand: vi.fn().mockResolvedValue(undefined),
	getCommands: vi.fn().mockResolvedValue([]),
};

export const authentication = {
	registerAuthenticationProvider: vi.fn(),
	getSession: vi.fn(),
	getSessions: vi.fn().mockResolvedValue([]),
};

export const Uri = {
	file: (path: string) => ({ fsPath: path }),
	parse: (uri: string) => ({ fsPath: uri }),
};

export const env = {
	uriScheme: "vscode",
	asExternalUri: vi.fn().mockResolvedValue({ toString: () => "" }),
	openExternal: vi.fn(),
};

export const extensions = {
	getExtension: vi.fn(),
};

export const ViewColumn = {
	One: 1,
	Two: 2,
	Three: 3,
};

export default {
	window,
	workspace,
	commands,
	authentication,
	Uri,
	env,
	extensions,
	ViewColumn,
	ConfigurationTarget,
	QuickPickItemKind,
	EventEmitter,
};
