import { WorkspaceVitals } from "@snapback/ui/vitals";
import { useEffect, useState } from "react";

interface VitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	score: number;
}

interface Guidance {
	message: string;
}

interface VSCodeAPI {
	postMessage: (message: unknown) => void;
	getState: () => unknown;
	setState: (state: unknown) => void;
}

declare global {
	interface Window {
		acquireVsCodeApi: () => VSCodeAPI;
	}
}

const _vscodeAPI = window.acquireVsCodeApi?.();

export function App() {
	const [vitals, setVitals] = useState<VitalsData>({
		pulse: 0,
		temperature: 0,
		pressure: 0,
		oxygen: 100,
		score: 100,
	});
	const [guidance, setGuidance] = useState<Guidance | undefined>();

	useEffect(() => {
		// Listen for messages from extension
		const messageHandler = (event: MessageEvent) => {
			const message = event.data;
			if (message.type === "update") {
				if (message.vitals) {
					setVitals(message.vitals);
				}
				if (message.guidance) {
					setGuidance(message.guidance);
				}
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	return (
		<div className="p-6 bg-zinc-950 text-zinc-100 min-h-screen">
			<WorkspaceVitals vitals={vitals} guidance={guidance} showInitPrompt={vitals.score === 0} />
		</div>
	);
}
