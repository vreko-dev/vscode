import type React from "react";

type Step = "welcome" | "detect" | "configure" | "test" | "cli" | "complete";

interface StepIndicatorProps {
	steps: Step[];
	currentStep: number;
}

const STEP_LABELS: Record<Step, string> = {
	welcome: "Welcome",
	detect: "Detect",
	configure: "Configure",
	test: "Test",
	cli: "CLI",
	complete: "Complete",
};

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
	return (
		<div className="flex items-center justify-between mb-8 relative">
			{steps.map((step, idx) => (
				<div key={step} className="flex flex-col items-center flex-1 relative">
					{/* Connector line */}
					{idx < steps.length - 1 && (
						<div
							className={`absolute top-5 left-1/2 h-0.5 ${
								idx < currentStep ? "bg-emerald-500" : "bg-zinc-700"
							}`}
							style={{ width: "calc(100% - 2rem)", transform: "translateX(1rem)" }}
						/>
					)}

					{/* Circle */}
					<div
						className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
							idx < currentStep
								? "bg-emerald-500 text-zinc-950"
								: idx === currentStep
									? "bg-blue-500 text-white ring-2 ring-blue-400"
									: "bg-zinc-800 text-zinc-400"
						}`}
					>
						{idx < currentStep ? "✓" : idx + 1}
					</div>

					{/* Label */}
					<span
						className={`mt-2 text-xs font-medium text-center ${
							idx <= currentStep ? "text-zinc-100" : "text-zinc-500"
						}`}
					>
						{STEP_LABELS[step]}
					</span>
				</div>
			))}
		</div>
	);
};
