/**
 * DaemonClient interface  -  thin request/response contract for daemon IPC.
 * Satisfied by DaemonBridge.
 */
export interface DaemonClient {
	request<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}
