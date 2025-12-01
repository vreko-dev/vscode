import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LazyLoader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Constructor", () => {
		it("should create loader without loading factory", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			expect(loader).toBeDefined();
			expect(factory).not.toHaveBeenCalled(); // Lazy - not loaded yet
		});

		it("should accept optional name for debugging", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory, "MyService");

			expect(loader.getName()).toBe("MyService");
		});

		it("should default to 'unnamed' when no name provided", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			expect(loader.getName()).toBe("unnamed");
		});
	});

	describe("get()", () => {
		it("should load service on first access", async () => {
			const service = { name: "TestService", doWork: () => "result" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const result = await loader.get();

			expect(factory).toHaveBeenCalledOnce();
			expect(result).toBe(service);
		});

		it("should return cached service on subsequent calls", async () => {
			const service = { name: "TestService" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const result1 = await loader.get();
			const result2 = await loader.get();
			const result3 = await loader.get();

			expect(factory).toHaveBeenCalledOnce(); // Only once
			expect(result1).toBe(service);
			expect(result2).toBe(service);
			expect(result3).toBe(service);
		});

		it("should handle concurrent get() calls correctly", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			// Start multiple concurrent get() calls
			const promise1 = loader.get();
			const promise2 = loader.get();
			const promise3 = loader.get();

			// Resolve factory after all get() calls started
			const service = { name: "TestService" };
			resolveFactory!(service);

			const [result1, result2, result3] = await Promise.all([
				promise1,
				promise2,
				promise3,
			]);

			// Factory should only be called once
			expect(factory).toHaveBeenCalledOnce();
			expect(result1).toBe(service);
			expect(result2).toBe(service);
			expect(result3).toBe(service);
		});

		it("should throw error if factory throws", async () => {
			const error = new Error("Factory failed");
			const factory = vi.fn().mockRejectedValue(error);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory, "FailingService");

			await expect(loader.get()).rejects.toThrow("Factory failed");
			expect(factory).toHaveBeenCalledOnce();
		});

		it("should retry factory on subsequent calls after error", async () => {
			const error = new Error("Temporary failure");
			const service = { name: "TestService" };
			const factory = vi
				.fn()
				.mockRejectedValueOnce(error) // First call fails
				.mockResolvedValueOnce(service); // Second call succeeds

			const { LazyLoader } = await import("../../../src/services/LazyLoader");
			const loader = new LazyLoader(factory);

			// First call should fail
			await expect(loader.get()).rejects.toThrow("Temporary failure");

			// Second call should succeed
			const result = await loader.get();
			expect(result).toBe(service);
			expect(factory).toHaveBeenCalledTimes(2);
		});

		it("should cache service after successful retry", async () => {
			const error = new Error("Temporary failure");
			const service = { name: "TestService" };
			const factory = vi
				.fn()
				.mockRejectedValueOnce(error)
				.mockResolvedValueOnce(service);

			const { LazyLoader } = await import("../../../src/services/LazyLoader");
			const loader = new LazyLoader(factory);

			await expect(loader.get()).rejects.toThrow();
			await loader.get(); // Success
			await loader.get(); // Should use cache

			expect(factory).toHaveBeenCalledTimes(2); // Not 3
		});
	});

	describe("isLoaded()", () => {
		it("should return false before loading", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			expect(loader.isLoaded()).toBe(false);
		});

		it("should return true after successful loading", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();

			expect(loader.isLoaded()).toBe(true);
		});

		it("should return false if loading failed", async () => {
			const factory = vi.fn().mockRejectedValue(new Error("Failed"));
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await expect(loader.get()).rejects.toThrow();

			expect(loader.isLoaded()).toBe(false);
		});

		it("should return true during loading", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const getPromise = loader.get();

			// Should be loading
			expect(loader.isLoaded()).toBe(false);
			expect(loader.isLoading()).toBe(true);

			resolveFactory!({ name: "TestService" });
			await getPromise;

			expect(loader.isLoaded()).toBe(true);
			expect(loader.isLoading()).toBe(false);
		});
	});

	describe("isLoading()", () => {
		it("should return false before loading", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			expect(loader.isLoading()).toBe(false);
		});

		it("should return true during loading", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const getPromise = loader.get();

			expect(loader.isLoading()).toBe(true);

			resolveFactory!({ name: "TestService" });
			await getPromise;

			expect(loader.isLoading()).toBe(false);
		});

		it("should return false after loading completes", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();

			expect(loader.isLoading()).toBe(false);
		});

		it("should return false after loading fails", async () => {
			const factory = vi.fn().mockRejectedValue(new Error("Failed"));
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await expect(loader.get()).rejects.toThrow();

			expect(loader.isLoading()).toBe(false);
		});
	});

	describe("getIfLoaded()", () => {
		it("should return undefined if not loaded", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const result = loader.getIfLoaded();

			expect(result).toBeUndefined();
			expect(factory).not.toHaveBeenCalled();
		});

		it("should return service if already loaded", async () => {
			const service = { name: "TestService" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			const result = loader.getIfLoaded();

			expect(result).toBe(service);
		});

		it("should not trigger loading", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			loader.getIfLoaded();
			loader.getIfLoaded();
			loader.getIfLoaded();

			expect(factory).not.toHaveBeenCalled();
		});
	});

	describe("preload()", () => {
		it("should start loading without waiting", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			loader.preload();

			expect(factory).toHaveBeenCalledOnce();
			expect(loader.isLoading()).toBe(true);
		});

		it("should allow get() to wait for preloaded service", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			// Start preload
			loader.preload();
			expect(loader.isLoading()).toBe(true);

			// Resolve factory
			const service = { name: "TestService" };
			resolveFactory!(service);

			// get() should return the preloaded service
			const result = await loader.get();
			expect(result).toBe(service);
			expect(factory).toHaveBeenCalledOnce(); // Not twice
		});

		it("should do nothing if already loaded", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			loader.preload();
			loader.preload();

			expect(factory).toHaveBeenCalledOnce(); // Only from get()
		});

		it("should do nothing if already loading", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			loader.preload();
			loader.preload();
			loader.preload();

			expect(factory).toHaveBeenCalledOnce();

			resolveFactory!({ name: "TestService" });
			await loader.get();
		});
	});

	describe("reset()", () => {
		it("should clear loaded service", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			expect(loader.isLoaded()).toBe(true);

			loader.reset();

			expect(loader.isLoaded()).toBe(false);
			expect(loader.getIfLoaded()).toBeUndefined();
		});

		it("should reload service on next get() after reset", async () => {
			const service1 = { name: "Service1" };
			const service2 = { name: "Service2" };
			const factory = vi
				.fn()
				.mockResolvedValueOnce(service1)
				.mockResolvedValueOnce(service2);

			const { LazyLoader } = await import("../../../src/services/LazyLoader");
			const loader = new LazyLoader(factory);

			const result1 = await loader.get();
			expect(result1).toBe(service1);

			loader.reset();

			const result2 = await loader.get();
			expect(result2).toBe(service2);
			expect(factory).toHaveBeenCalledTimes(2);
		});

		it("should allow reset during loading", async () => {
			let resolveFactory: (value: unknown) => void;
			const factoryPromise = new Promise((resolve) => {
				resolveFactory = resolve;
			});
			const factory = vi.fn().mockReturnValue(factoryPromise);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			const getPromise = loader.get();
			expect(loader.isLoading()).toBe(true);

			loader.reset();

			expect(loader.isLoading()).toBe(false);
			expect(loader.isLoaded()).toBe(false);

			// Original promise should still reject or handle gracefully
			resolveFactory!({ name: "TestService" });
			await getPromise; // Should complete even after reset
		});

		it("should dispose service if it has dispose method", async () => {
			const service = {
				name: "TestService",
				dispose: vi.fn(),
			};
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			loader.reset();

			expect(service.dispose).toHaveBeenCalledOnce();
		});

		it("should not error if service has no dispose method", async () => {
			const service = { name: "TestService" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();

			expect(() => loader.reset()).not.toThrow();
		});
	});

	describe("dispose()", () => {
		it("should dispose loaded service", async () => {
			const service = {
				name: "TestService",
				dispose: vi.fn(),
			};
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			loader.dispose();

			expect(service.dispose).toHaveBeenCalledOnce();
		});

		it("should clear loaded state after dispose", async () => {
			const service = { name: "TestService", dispose: vi.fn() };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();
			loader.dispose();

			expect(loader.isLoaded()).toBe(false);
			expect(loader.getIfLoaded()).toBeUndefined();
		});

		it("should not error if service not loaded", async () => {
			const factory = vi.fn().mockResolvedValue({ name: "TestService" });
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			expect(() => loader.dispose()).not.toThrow();
		});

		it("should not error if service has no dispose method", async () => {
			const service = { name: "TestService" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			await loader.get();

			expect(() => loader.dispose()).not.toThrow();
		});
	});

	describe("Type Safety", () => {
		it("should maintain type safety for loaded service", async () => {
			interface MyService {
				name: string;
				doWork: () => string;
			}

			const service: MyService = {
				name: "TestService",
				doWork: () => "result",
			};
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader<MyService>(factory);

			const result = await loader.get();

			// TypeScript should know result is MyService
			expect(result.name).toBe("TestService");
			expect(result.doWork()).toBe("result");
		});
	});

	describe("Performance", () => {
		it("should handle rapid get() calls efficiently", async () => {
			const service = { name: "TestService" };
			const factory = vi.fn().mockResolvedValue(service);
			const { LazyLoader } = await import("../../../src/services/LazyLoader");

			const loader = new LazyLoader(factory);

			// Rapid concurrent calls
			const promises = Array.from({ length: 100 }, () => loader.get());

			const results = await Promise.all(promises);

			// Factory should only be called once
			expect(factory).toHaveBeenCalledOnce();

			// All results should be the same instance
			for (const result of results) {
				expect(result).toBe(service);
			}
		});
	});
});
