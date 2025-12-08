import { beforeEach, describe, expect, it } from "vitest";
import { PerformanceMonitor } from "@vscode/performance/PerformanceMonitor";
import {
	getPerformanceMonitor,
	setPerformanceMonitor,
	timedClass,
	timedMethod,
} from "@vscode/performance/timingDecorators";

describe("Timing Decorators", () => {
	let monitor: PerformanceMonitor;

	beforeEach(() => {
		monitor = new PerformanceMonitor({ outputFormat: "silent" });
		setPerformanceMonitor(monitor);
	});

	describe("@timedMethod decorator", () => {
		it("should track synchronous method execution", () => {
			class TestClass {
				@timedMethod()
				syncMethod() {
					return "result";
				}
			}

			const instance = new TestClass();
			const result = instance.syncMethod();

			expect(result).toBe("result");
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.syncMethod");
		});

		it("should track asynchronous method execution", async () => {
			class TestClass {
				@timedMethod()
				async asyncMethod() {
					// Simulate async work
					await new Promise((resolve) => setTimeout(resolve, 10));
					return "async-result";
				}
			}

			const instance = new TestClass();
			const result = await instance.asyncMethod();

			expect(result).toBe("async-result");
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.asyncMethod");
			expect(timings[0].duration).toBeGreaterThan(5);
		});

		it("should handle method errors gracefully", () => {
			class TestClass {
				@timedMethod()
				errorMethod() {
					throw new Error("Test error");
				}
			}

			const instance = new TestClass();

			expect(() => instance.errorMethod()).toThrow("Test error");
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.errorMethod");
		});

		it("should handle async method errors gracefully", async () => {
			class TestClass {
				@timedMethod()
				async errorAsyncMethod() {
					await new Promise((resolve) => setTimeout(resolve, 5));
					throw new Error("Async test error");
				}
			}

			const instance = new TestClass();

			await expect(instance.errorAsyncMethod()).rejects.toThrow(
				"Async test error",
			);
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.errorAsyncMethod");
		});

		it("should use custom operation name when provided", () => {
			class TestClass {
				@timedMethod("custom-operation-name")
				someMethod() {
					return "result";
				}
			}

			const instance = new TestClass();
			instance.someMethod();

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("custom-operation-name");
		});
	});

	describe("@timedClass decorator", () => {
		it("should track all methods in a class", () => {
			@timedClass()
			class TestClass {
				method1() {
					return "result1";
				}

				method2() {
					return 42;
				}

				method3() {
					return true;
				}
			}

			const instance = new TestClass();
			instance.method1();
			instance.method2();
			instance.method3();

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(3);

			const operationNames = timings.map((t) => t.operationName);
			expect(operationNames).toContain("TestClass.method1");
			expect(operationNames).toContain("TestClass.method2");
			expect(operationNames).toContain("TestClass.method3");
		});

		it("should track async methods in a decorated class", async () => {
			@timedClass()
			class TestClass {
				async asyncMethod() {
					await new Promise((resolve) => setTimeout(resolve, 5));
					return "async-result";
				}
			}

			const instance = new TestClass();
			const result = await instance.asyncMethod();

			expect(result).toBe("async-result");
			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.asyncMethod");
		});

		it("should use custom class name when provided", () => {
			@timedClass("CustomClassName")
			class TestClass {
				someMethod() {
					return "result";
				}
			}

			const instance = new TestClass();
			instance.someMethod();

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("CustomClassName.someMethod");
		});

		it("should not track constructor", () => {
			@timedClass()
			class TestClass {
				constructor() {
					// Constructor should not be tracked
				}

				someMethod() {
					return "result";
				}
			}

			const instance = new TestClass();
			instance.someMethod();

			const timings = monitor.getTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operationName).toBe("TestClass.someMethod");
		});
	});

	describe("Global Monitor Access", () => {
		it("should allow setting and getting the global monitor", () => {
			const newMonitor = new PerformanceMonitor();
			setPerformanceMonitor(newMonitor);
			expect(getPerformanceMonitor()).toBe(newMonitor);
		});

		it("should return null when no monitor is set", () => {
			setPerformanceMonitor(null);
			expect(getPerformanceMonitor()).toBeNull();
		});
	});

	describe("Disabled Monitoring", () => {
		it("should not track operations when monitor is disabled", () => {
			const disabledMonitor = new PerformanceMonitor({ enabled: false });
			setPerformanceMonitor(disabledMonitor);

			class TestClass {
				@timedMethod()
				someMethod(): string {
					return "result";
				}
			}

			const instance = new TestClass();
			const result = instance.someMethod();

			expect(result).toBe("result");
			expect(disabledMonitor.getTimings()).toHaveLength(0);
		});

		it("should not track class methods when monitor is disabled", () => {
			const disabledMonitor = new PerformanceMonitor({ enabled: false });
			setPerformanceMonitor(disabledMonitor);

			@timedClass()
			class TestClass {
				someMethod(): string {
					return "result";
				}
			}

			const instance = new TestClass();
			const result = instance.someMethod();

			expect(result).toBe("result");
			expect(disabledMonitor.getTimings()).toHaveLength(0);
		});
	});
});
