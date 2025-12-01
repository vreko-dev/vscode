/**
 * Utility helpers for working with VS Code style events in tests.
 *
 * Provides a deterministic way to wait until an event fires, avoiding
 * ad-hoc `setTimeout` calls that can lead to flaky tests.
 */

interface DisposableLike {
	dispose(): void;
}

type VSCodeEvent<T> = (
	listener: (event: T) => unknown,
	thisArgs?: unknown,
	disposables?: { push(disposable: DisposableLike): void },
) => DisposableLike | undefined;

export interface WaitForEventOptions {
	timeout?: number;
}

/**
 * Wait for a VS Code style event to fire while optionally executing an action.
 *
 * @param event - Event to subscribe to (VS Code style Event<T>)
 * @param action - Optional action to trigger after subscribing
 * @param options - Optional configuration such as timeout
 * @returns Promise that resolves with the event payload
 */
export async function waitForEvent<T>(
	event: VSCodeEvent<T>,
	action?: () => unknown | Promise<unknown>,
	options?: WaitForEventOptions,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timer: NodeJS.Timeout | undefined;

		const dispose = (subscription?: DisposableLike | undefined) => {
			if (subscription && typeof subscription.dispose === "function") {
				subscription.dispose();
			}
		};

		const listener = (value: T) => {
			settled = true;
			if (timer) {
				clearTimeout(timer);
			}
			dispose(subscription);
			resolve(value);
		};

		const subscription = event(listener);

		if (options?.timeout) {
			timer = setTimeout(() => {
				if (!settled) {
					dispose(subscription);
					reject(new Error(`Event did not fire within ${options.timeout}ms`));
				}
			}, options.timeout);
		}

		Promise.resolve()
			.then(() => action?.())
			.catch((error) => {
				if (timer) {
					clearTimeout(timer);
				}
				dispose(subscription);
				reject(error);
			});
	});
}
