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

describe("StorageErrors", () => {
	describe("StorageError", () => {
		it("should create a StorageError with correct properties", () => {
			const error = new StorageError("Test storage error");

			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("StorageError");
			expect(error.message).toBe("Test storage error");
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new StorageError("Test storage error", { cause });

			expect(error.message).toBe("Test storage error");
			// Error options are passed to the base Error class
		});
	});

	describe("DatabaseError", () => {
		it("should create a DatabaseError with correct properties", () => {
			const error = new DatabaseError("Test database error");

			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("DatabaseError");
			expect(error.message).toBe("Test database error");
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new DatabaseError("Test database error", { cause });

			expect(error.message).toBe("Test database error");
			// Error options are passed to the base Error class
		});
	});

	describe("DatabaseConnectionError", () => {
		it("should create a DatabaseConnectionError with correct properties", () => {
			const error = new DatabaseConnectionError("Test connection error");

			expect(error).toBeInstanceOf(DatabaseConnectionError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("DatabaseConnectionError");
			expect(error.message).toBe("Test connection error");
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new DatabaseConnectionError("Test connection error", {
				cause,
			});

			expect(error.message).toBe("Test connection error");
			// Error options are passed to the base Error class
		});
	});

	describe("DatabaseQueryError", () => {
		it("should create a DatabaseQueryError with correct properties", () => {
			const error = new DatabaseQueryError(
				"Test query error",
				"SELECT * FROM test",
				["param1", "param2"],
			);

			expect(error).toBeInstanceOf(DatabaseQueryError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("DatabaseQueryError");
			expect(error.message).toBe("Test query error");
			expect(error.query).toBe("SELECT * FROM test");
			expect(error.parameters).toEqual(["param1", "param2"]);
		});

		it("should create a DatabaseQueryError without query and parameters", () => {
			const error = new DatabaseQueryError("Test query error");

			expect(error).toBeInstanceOf(DatabaseQueryError);
			expect(error.name).toBe("DatabaseQueryError");
			expect(error.message).toBe("Test query error");
			expect(error.query).toBeUndefined();
			expect(error.parameters).toBeUndefined();
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new DatabaseQueryError(
				"Test query error",
				undefined,
				undefined,
				{ cause },
			);

			expect(error.message).toBe("Test query error");
			// Error options are passed to the base Error class
		});
	});

	describe("DatabaseTransactionError", () => {
		it("should create a DatabaseTransactionError with correct properties", () => {
			const error = new DatabaseTransactionError(
				"Test transaction error",
				"INSERT",
			);

			expect(error).toBeInstanceOf(DatabaseTransactionError);
			expect(error).toBeInstanceOf(DatabaseError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("DatabaseTransactionError");
			expect(error.message).toBe("Test transaction error");
			expect(error.operation).toBe("INSERT");
		});

		it("should create a DatabaseTransactionError without operation", () => {
			const error = new DatabaseTransactionError("Test transaction error");

			expect(error).toBeInstanceOf(DatabaseTransactionError);
			expect(error.name).toBe("DatabaseTransactionError");
			expect(error.message).toBe("Test transaction error");
			expect(error.operation).toBeUndefined();
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new DatabaseTransactionError(
				"Test transaction error",
				undefined,
				{ cause },
			);

			expect(error.message).toBe("Test transaction error");
			// Error options are passed to the base Error class
		});
	});

	describe("CheckpointError", () => {
		it("should create a CheckpointError with correct properties", () => {
			const error = new CheckpointError("Test checkpoint error", "cp_123");

			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("CheckpointError");
			expect(error.message).toBe("Test checkpoint error");
			expect(error.checkpointId).toBe("cp_123");
		});

		it("should create a CheckpointError without checkpointId", () => {
			const error = new CheckpointError("Test checkpoint error");

			expect(error).toBeInstanceOf(CheckpointError);
			expect(error.name).toBe("CheckpointError");
			expect(error.message).toBe("Test checkpoint error");
			expect(error.checkpointId).toBeUndefined();
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new CheckpointError("Test checkpoint error", undefined, {
				cause,
			});

			expect(error.message).toBe("Test checkpoint error");
			// Error options are passed to the base Error class
		});
	});

	describe("CheckpointNotFoundError", () => {
		it("should create a CheckpointNotFoundError with correct properties", () => {
			const error = new CheckpointNotFoundError("cp_123");

			expect(error).toBeInstanceOf(CheckpointNotFoundError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("CheckpointNotFoundError");
			expect(error.message).toBe("Checkpoint not found: cp_123");
			expect(error.checkpointId).toBe("cp_123");
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new CheckpointNotFoundError("cp_123", { cause });

			expect(error.message).toBe("Checkpoint not found: cp_123");
			// Error options are passed to the base Error class
		});
	});

	describe("CheckpointChainCorruptionError", () => {
		it("should create a CheckpointChainCorruptionError with correct properties", () => {
			const chainInfo = {
				expectedParentId: "cp_123",
				actualParentId: "cp_456",
				chainLength: 5,
			};
			const error = new CheckpointChainCorruptionError("cp_789", chainInfo);

			expect(error).toBeInstanceOf(CheckpointChainCorruptionError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("CheckpointChainCorruptionError");
			expect(error.message).toBe(
				"Checkpoint chain corruption detected at checkpoint: cp_789",
			);
			expect(error.checkpointId).toBe("cp_789");
			expect(error.chainInfo).toEqual(chainInfo);
		});

		it("should create a CheckpointChainCorruptionError without chainInfo", () => {
			const error = new CheckpointChainCorruptionError("cp_789");

			expect(error).toBeInstanceOf(CheckpointChainCorruptionError);
			expect(error.name).toBe("CheckpointChainCorruptionError");
			expect(error.message).toBe(
				"Checkpoint chain corruption detected at checkpoint: cp_789",
			);
			expect(error.checkpointId).toBe("cp_789");
			expect(error.chainInfo).toBeUndefined();
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new CheckpointChainCorruptionError("cp_789", undefined, {
				cause,
			});

			expect(error.message).toBe(
				"Checkpoint chain corruption detected at checkpoint: cp_789",
			);
			// Error options are passed to the base Error class
		});
	});

	describe("CheckpointValidationError", () => {
		it("should create a CheckpointValidationError with correct properties", () => {
			const validationIssues = ["Invalid timestamp", "Missing files"];
			const error = new CheckpointValidationError("cp_123", validationIssues);

			expect(error).toBeInstanceOf(CheckpointValidationError);
			expect(error).toBeInstanceOf(CheckpointError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("CheckpointValidationError");
			expect(error.message).toBe(
				"Checkpoint validation failed: Invalid timestamp, Missing files",
			);
			expect(error.checkpointId).toBe("cp_123");
			expect(error.validationIssues).toEqual(validationIssues);
		});

		it("should create a CheckpointValidationError without validationIssues", () => {
			const error = new CheckpointValidationError("cp_123");

			expect(error).toBeInstanceOf(CheckpointValidationError);
			expect(error.name).toBe("CheckpointValidationError");
			expect(error.message).toBe(
				"Checkpoint validation failed for checkpoint: cp_123",
			);
			expect(error.checkpointId).toBe("cp_123");
			expect(error.validationIssues).toBeUndefined();
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new CheckpointValidationError("cp_123", undefined, {
				cause,
			});

			expect(error.message).toBe(
				"Checkpoint validation failed for checkpoint: cp_123",
			);
			// Error options are passed to the base Error class
		});
	});

	describe("StorageIntegrityError", () => {
		it("should create a StorageIntegrityError with correct properties", () => {
			const error = new StorageIntegrityError("Test integrity error");

			expect(error).toBeInstanceOf(StorageIntegrityError);
			expect(error).toBeInstanceOf(StorageError);
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("StorageIntegrityError");
			expect(error.message).toBe("Test integrity error");
		});

		it("should accept error options", () => {
			const cause = new Error("Original error");
			const error = new StorageIntegrityError("Test integrity error", {
				cause,
			});

			expect(error.message).toBe("Test integrity error");
			// Error options are passed to the base Error class
		});
	});

	describe("Error inheritance chain", () => {
		it("should maintain proper instanceof relationships", () => {
			const storageError = new StorageError("Storage error");
			const databaseError = new DatabaseError("Database error");
			const checkpointError = new CheckpointError("Checkpoint error");

			// StorageError instanceof checks
			expect(storageError instanceof StorageError).toBe(true);
			expect(storageError instanceof Error).toBe(true);

			// DatabaseError instanceof checks
			expect(databaseError instanceof DatabaseError).toBe(true);
			expect(databaseError instanceof StorageError).toBe(true);
			expect(databaseError instanceof Error).toBe(true);

			// CheckpointError instanceof checks
			expect(checkpointError instanceof CheckpointError).toBe(true);
			expect(checkpointError instanceof StorageError).toBe(true);
			expect(checkpointError instanceof Error).toBe(true);
		});
	});
});
