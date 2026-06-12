export class PerformanceTestHelper {
	private startTime: number = 0;
	private started: boolean = false;
	private markers: Map<string, number> = new Map();

	startTimer() {
		this.startTime = Date.now();
		this.started = true;
	}

	getElapsedTime(): number {
		if (!this.started) {
			throw new Error("PerformanceTestHelper: call startTimer() before getElapsedTime()");
		}
		return Date.now() - this.startTime;
	}

	markTime(name: string) {
		if (!this.started) {
			throw new Error(`PerformanceTestHelper: call startTimer() before markTime("${name}")`);
		}
		this.markers.set(name, Date.now() - this.startTime);
	}

	getMarkerTime(name: string): number {
		const value = this.markers.get(name);
		if (value === undefined) {
			throw new Error(`PerformanceTestHelper: no marker named "${name}"  -  call markTime("${name}") first`);
		}
		return value;
	}

	reset() {
		this.startTime = 0;
		this.started = false;
		this.markers.clear();
	}
}

