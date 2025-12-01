import { logger } from "@snapback/infrastructure";
import {
	getBetterSqlite3LoadError,
	isBetterSqlite3Available,
} from "../../src/storage/SqliteSnapshotStorage";

export const sqliteAvailable = isBetterSqlite3Available();

export const describeSqlite = sqliteAvailable ? describe : describe.skip;

if (!sqliteAvailable) {
	const reason =
		getBetterSqlite3LoadError()?.message ??
		"better-sqlite3 native module unavailable";
	// eslint-disable-next-line no-console
	logger.warn(`[snapback-tests] Skipping SQLite-backed tests: ${reason}`);
}
