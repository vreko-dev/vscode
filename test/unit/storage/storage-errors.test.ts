import { describe, expect, it } from "vitest";
import {
	CheckpointChainCorruptionError,
	CheckpointError,
	CheckpointNotFoundError,
	CheckpointValidationError,
	DatabaseConnectionError,
	DatabaseError,
	DatabaseQueryError,
	DatabaseTransactionError,
	StorageError,
	StorageIntegrityError,
} from "../../../src/storage/StorageErrors";

describe("Storage Errors", () => {
	describe("StorageError", () => {
		it("should create a StorageError with correct properties", () => {
			const error = new StorageError("Test storage error");
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("StorageError");
			expect(error.message).toBe("Test storage error");
		});

		it("should create a StorageError with correct properties", () => {
			const error = new StorageError("Test storage error");
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("StorageError");
			expect(error.message).toBe("Test storage error");
		});
	});

	describe("Database Errors", () => {
		it("should create a DatabaseError with correct properties", () => {
			const error = new DatabaseError("Test database error");
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("DatabaseError");
			expect(error.message).toBe("Test database error");
		});

		it("should create a DatabaseConnectionError with correct properties", () => {
			const error = new DatabaseConnectionError("Test connection error");
			expect(error).toBeInstanceOf(DatabaseConnectionError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("DatabaseConnectionError");
			expect(error.message).toBe("Test connection error");
		});

		it("should create a DatabaseQueryError with query information", () => {
			const error = new DatabaseQueryError(
				"Test query error",
				"SELECT * FROM checkpoints",
				["param1", "param2"],
			);

			expect(error).toBeInstanceOf(DatabaseQueryError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("DatabaseQueryError");
			expect(error.message).toBe("Test query error");
			expect(error.query).toBe("SELECT * FROM checkpoints");
			expect(error.parameters).toEqual(["param1", "param2"]);
		});

		it("should create a DatabaseQueryError without query information", () => {
			const error = new DatabaseQueryError("Test query error");

			expect(error).toBeInstanceOf(DatabaseQueryError);
			expect(error.query).toBeUndefined();
			expect(error.parameters).toBeUndefined();
		});

		it("should create a DatabaseTransactionError with operation information", () => {
			const error = new DatabaseTransactionError(
				"Test transaction error",
				"INSERT_CHECKPOINT",
			);

			expect(error).toBeInstanceOf(DatabaseTransactionError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("DatabaseTransactionError");
			expect(error.message).toBe("Test transaction error");
			expect(error.operation).toBe("INSERT_CHECKPOINT");
		});

		it("should create a DatabaseTransactionError without operation information", () => {
			const error = new DatabaseTransactionError("Test transaction error");

			expect(error).toBeInstanceOf(DatabaseTransactionError);
			expect(error.operation).toBeUndefined();
		});
	});

	describe("Checkpoint Errors", () => {
		it("should create a CheckpointError with checkpoint ID", () => {
			const error = new CheckpointError("Test checkpoint error", "cp_123");
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("CheckpointError");
			expect(error.message).toBe("Test checkpoint error");
			expect(error.checkpointId).toBe("cp_123");
		});

		it("should create a CheckpointNotFoundError with descriptive message", () => {
			const error = new CheckpointNotFoundError("cp_456");
			expect(error).toBeInstanceOf(CheckpointNotFoundError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("CheckpointNotFoundError");
			expect(error.message).toBe("Checkpoint not found: cp_456");
			expect(error.checkpointId).toBe("cp_456");
		});

		it("should create a CheckpointChainCorruptionError with chain information", () => {
			const chainInfo = {
				expectedParentId: "cp_111",
				actualParentId: "cp_222",
				chainLength: 5,
			};

			const error = new CheckpointChainCorruptionError("cp_789", chainInfo);
			expect(error).toBeInstanceOf(CheckpointChainCorruptionError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("CheckpointChainCorruptionError");
			expect(error.message).toBe(
				"Checkpoint chain corruption detected at checkpoint: cp_789",
			);
			expect(error.checkpointId).toBe("cp_789");
			expect(error.chainInfo).toEqual(chainInfo);
		});

		it("should create a CheckpointChainCorruptionError without chain information", () => {
			const error = new CheckpointChainCorruptionError("cp_789");
			expect(error).toBeInstanceOf(CheckpointChainCorruptionError);
			expect(error.chainInfo).toBeUndefined();
		});

		it("should create a CheckpointValidationError with validation issues", () => {
			const issues = ["Invalid timestamp", "Missing metadata"];
			const error = new CheckpointValidationError("cp_abc", issues);

			expect(error).toBeInstanceOf(CheckpointValidationError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error.name).toBe("CheckpointValidationError");
			expect(error.message).toBe(
				"Checkpoint validation failed: Invalid timestamp, Missing metadata",
			);
			expect(error.checkpointId).toBe("cp_abc");
			expect(error.validationIssues).toEqual(issues);
		});

		it("should create a CheckpointValidationError without validation issues", () => {
			const error = new CheckpointValidationError("cp_def");

			expect(error).toBeInstanceOf(CheckpointValidationError);
			expect(error.message).toBe(
				"Checkpoint validation failed for checkpoint: cp_def",
			);
			expect(error.validationIssues).toBeUndefined();
		});
	});

	describe("Storage Integrity Errors", () => {
		it("should create a StorageIntegrityError with correct properties", () => {
			const error = new StorageIntegrityError("Test integrity error");
			expect(error).toBeInstanceOf(StorageIntegrityError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("StorageIntegrityError");
			expect(error.message).toBe("Test integrity error");
		});
	});

	describe("Error Instance Checks", () => {
		it("should support instanceof checks for error hierarchy", () => {
			const storageError = new StorageError("Storage error");
			const dbError = new DatabaseError("Database error");
			const connError = new DatabaseConnectionError("Connection error");
			const queryError = new DatabaseQueryError("Query error");
			const txError = new DatabaseTransactionError("Transaction error");
			const cpError = new CheckpointError("Checkpoint error", "cp_123");
			const notFoundError = new CheckpointNotFoundError("cp_456");
			const corruptionError = new CheckpointChainCorruptionError("cp_789");
			const validationError = new CheckpointValidationError("cp_abc");
			const integrityError = new StorageIntegrityError("Integrity error");

			// StorageError hierarchy
			expect(storageError instanceof StorageError).toBe(true);
			expect(storageError instanceof Error).toBe(true);

			// DatabaseError hierarchy
			expect(dbError instanceof DatabaseError).toBe(true);
			expect(dbError instanceof StorageError).toBe(true);
			expect(dbError instanceof Error).toBe(true);

			expect(connError instanceof DatabaseConnectionError).toBe(true);
			expect(connError instanceof DatabaseError).toBe(true);
			expect(connError instanceof StorageError).toBe(true);
			expect(connError instanceof Error).toBe(true);

			expect(queryError instanceof DatabaseQueryError).toBe(true);
			expect(queryError instanceof DatabaseError).toBe(true);
			expect(queryError instanceof StorageError).toBe(true);
			expect(queryError instanceof Error).toBe(true);

			expect(txError instanceof DatabaseTransactionError).toBe(true);
			expect(txError instanceof DatabaseError).toBe(true);
			expect(txError instanceof StorageError).toBe(true);
			expect(txError instanceof Error).toBe(true);

			// CheckpointError hierarchy
			expect(cpError instanceof CheckpointError).toBe(true);
			expect(cpError instanceof StorageError).toBe(true);
			expect(cpError instanceof Error).toBe(true);

			expect(notFoundError instanceof CheckpointNotFoundError).toBe(true);
			expect(notFoundError instanceof CheckpointError).toBe(true);
			expect(notFoundError instanceof StorageError).toBe(true);
			expect(notFoundError instanceof Error).toBe(true);

			expect(corruptionError instanceof CheckpointChainCorruptionError).toBe(
				true,
			);
			expect(corruptionError instanceof CheckpointError).toBe(true);
			expect(corruptionError instanceof StorageError).toBe(true);
			expect(corruptionError instanceof Error).toBe(true);

			expect(validationError instanceof CheckpointValidationError).toBe(true);
			expect(validationError instanceof CheckpointError).toBe(true);
			expect(validationError instanceof StorageError).toBe(true);
			expect(validationError instanceof Error).toBe(true);

			// StorageIntegrityError
			expect(integrityError instanceof StorageIntegrityError).toBe(true);
			expect(integrityError instanceof StorageError).toBe(true);
			expect(integrityError instanceof Error).toBe(true);
		});
	});
});
