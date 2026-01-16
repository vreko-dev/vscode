import type React from "react";

interface StatusBadgeProps {
	status: "connected" | "enabled" | "disabled" | "error";
	label: string;
}

const styles = {
	connected: {
		bg: "bg-emerald-900/20",
		border: "border-emerald-500/50",
		text: "text-emerald-400",
		dot: "bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]",
	},
	enabled: {
		bg: "bg-amber-900/20",
		border: "border-amber-500/50",
		text: "text-amber-400",
		dot: "bg-amber-400",
	},
	disabled: {
		bg: "bg-zinc-800/50",
		border: "border-zinc-600",
		text: "text-zinc-500",
		dot: "bg-zinc-500",
	},
	error: {
		bg: "bg-red-900/20",
		border: "border-red-500/50",
		text: "text-red-400",
		dot: "bg-red-400",
	},
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
	const style = styles[status];
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2.5 py-1 ${style.bg} border ${style.border} rounded text-xs font-medium ${style.text} uppercase tracking-wide`}
		>
			<span className={`w-1.5 h-1.5 rounded-full ${status === "connected" ? style.dot : "bg-current"}`} />
			{label}
		</span>
	);
};
