// Shared VS Code API instance - can only be acquired once per webview
interface VSCodeAPI {
	postMessage: (message: unknown) => void;
	getState: () => unknown;
	setState: (state: unknown) => void;
}

// Acquire the API once and cache it
let vscodeAPI: VSCodeAPI | undefined;

export function getVSCodeAPI(): VSCodeAPI | undefined {
	if (!vscodeAPI && typeof window !== "undefined") {
		const acquireVsCodeApi = (window as { acquireVsCodeApi?: () => VSCodeAPI }).acquireVsCodeApi;
		if (acquireVsCodeApi) {
			vscodeAPI = acquireVsCodeApi();
		}
	}
	return vscodeAPI;
}
