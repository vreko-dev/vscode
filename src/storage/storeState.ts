// ============================================
// apps/vscode/src/storage/storeState.ts
// PRW: Persistent state + index for fast seq lookups
// ============================================

// ============================================
// Store State (state.json)
// Tracks the head of the checkpoint chain
// ============================================

export interface StoreState {
	/** Schema version for state file migrations */
	schemaVersion: 1;
	/** Last assigned sequence number */
	lastSeq: number;
	/** Current head checkpoint ID */
	headId: string | null;
	/** Timestamp of last state update */
	lastUpdatedAt: number;
}

export const DEFAULT_STATE: StoreState = {
	schemaVersion: 1,
	lastSeq: 0,
	headId: null,
	lastUpdatedAt: Date.now(),
};

// ============================================
// Sequence Index (index.json)
// Bidirectional mapping for O(1) lookups
// ============================================

export interface SeqIndex {
	/** Schema version for index migrations */
	schemaVersion: 1;
	/** seq → checkpoint id (for getBySeq) */
	bySeq: Record<number, string>;
	/** checkpoint id → seq (for parentSeq lookup on V1 manifests) */
	byId: Record<string, number>;
	/** Timestamp of last rebuild */
	rebuiltAt: number;
}

export const DEFAULT_INDEX: SeqIndex = {
	schemaVersion: 1,
	bySeq: {},
	byId: {},
	rebuiltAt: Date.now(),
};

// ============================================
// Helper Functions
// ============================================

/** Get max seq from index */
export function getMaxSeq(index: SeqIndex): number {
	const seqs = Object.keys(index.bySeq).map(Number);
	return seqs.length > 0 ? Math.max(...seqs) : 0;
}

/** Get checkpoint ID by seq */
export function getIdBySeq(index: SeqIndex, seq: number): string | undefined {
	return index.bySeq[seq];
}

/** Get seq by checkpoint ID */
export function getSeqById(index: SeqIndex, id: string): number | undefined {
	return index.byId[id];
}

/** Add entry to index (mutates in place) */
export function addToIndex(index: SeqIndex, seq: number, id: string): void {
	index.bySeq[seq] = id;
	index.byId[id] = seq;
}

/** Remove entry from index (mutates in place) */
export function removeFromIndex(index: SeqIndex, seq: number, id: string): void {
	delete index.bySeq[seq];
	delete index.byId[id];
}

/** Get ordered list of seq numbers */
export function getOrderedSeqs(index: SeqIndex): number[] {
	return Object.keys(index.bySeq)
		.map(Number)
		.sort((a, b) => a - b);
}

/** Check if index is empty */
export function isIndexEmpty(index: SeqIndex): boolean {
	return Object.keys(index.bySeq).length === 0;
}

// ============================================
// State Management
// ============================================

/** Increment seq and update state (returns new state) */
export function allocateSeq(state: StoreState): { newState: StoreState; seq: number } {
	const seq = state.lastSeq + 1;
	const newState: StoreState = {
		...state,
		lastSeq: seq,
		lastUpdatedAt: Date.now(),
	};
	return { newState, seq };
}

/** Update head pointer (returns new state) */
export function updateHead(state: StoreState, headId: string): StoreState {
	return {
		...state,
		headId,
		lastUpdatedAt: Date.now(),
	};
}

// ============================================
// Validation
// ============================================

export function isValidState(obj: unknown): obj is StoreState {
	if (!obj || typeof obj !== "object") return false;
	const state = obj as StoreState;
	return (
		state.schemaVersion === 1 &&
		typeof state.lastSeq === "number" &&
		(state.headId === null || typeof state.headId === "string") &&
		typeof state.lastUpdatedAt === "number"
	);
}

export function isValidIndex(obj: unknown): obj is SeqIndex {
	if (!obj || typeof obj !== "object") return false;
	const index = obj as SeqIndex;
	return (
		index.schemaVersion === 1 &&
		typeof index.bySeq === "object" &&
		typeof index.byId === "object" &&
		typeof index.rebuiltAt === "number"
	);
}
