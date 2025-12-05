import { PROTECTION_LEVEL_SIGNAGE } from "../signage/index.js";

export type ProtectionLevel = "Watched" | "Warning" | "Protected";

export interface ColorToken {
	primary: string;
	background: string;
	border: string;
	text: string;
	secondary?: string;
}

export interface DesignTokensType {
	colors: {
		Watched: ColorToken;
		Warning: ColorToken;
		Protected: ColorToken;
		neutral: {
			background: string;
			surface: string;
			border: string;
			textPrimary: string;
			textSecondary: string;
			textMuted: string;
		};
	};
	icons: {
		Watched: string;
		Warning: string;
		Protected: string;
	};
	typography: {
		fontSize: {
			small: string;
			medium: string;
			large: string;
		};
		fontWeight: {
			normal: number;
			semibold: number;
			bold: number;
		};
		letterSpacing: {
			tight: string;
			normal: string;
			wide: string;
		};
	};
	spacing: {
		xs: string;
		sm: string;
		md: string;
		lg: string;
		xl: string;
	};
}

export const DesignTokens: DesignTokensType & {
	getColor: (level: ProtectionLevel) => string;
	getIcon: (level: ProtectionLevel) => string;
	getLabel: (level: ProtectionLevel) => string;
} = {
	colors: {
		Watched: {
			primary: PROTECTION_LEVEL_SIGNAGE.watch.color || "#10B981", // From signage module
			background: "rgba(16, 185, 129, 0.1)",
			border: "rgba(16, 185, 129, 0.3)",
			text: "#10B981",
		},
		Warning: {
			primary: PROTECTION_LEVEL_SIGNAGE.warn.color || "#FF6B35", // From signage module
			background: "rgba(255, 107, 53, 0.1)",
			border: "rgba(255, 107, 53, 0.3)",
			text: "#FF6B35",
			secondary: "#F59E0B", // Amber for accents
		},
		Protected: {
			primary: PROTECTION_LEVEL_SIGNAGE.block.color || "#EF4444", // From signage module
			background: "rgba(239, 68, 68, 0.1)",
			border: "rgba(239, 68, 68, 0.3)",
			text: "#EF4444",
			secondary: "#DC2626", // Darker red for emphasis
		},
		neutral: {
			background: "#0A0A0A",
			surface: "#111111",
			border: "#27272A",
			textPrimary: "#FAFAFA",
			textSecondary: "rgba(250, 250, 250, 0.7)",
			textMuted: "rgba(250, 250, 250, 0.5)",
		},
	},
	icons: {
		Watched: PROTECTION_LEVEL_SIGNAGE.watch.emoji || "🟢", // From signage module
		Warning: PROTECTION_LEVEL_SIGNAGE.warn.emoji || "🟡", // From signage module
		Protected: PROTECTION_LEVEL_SIGNAGE.block.emoji || "🔴", // From signage module
	},
	typography: {
		fontSize: {
			small: "12px",
			medium: "13px",
			large: "14px",
		},
		fontWeight: {
			normal: 400,
			semibold: 600,
			bold: 700,
		},
		letterSpacing: {
			tight: "-0.01em",
			normal: "0",
			wide: "0.05em",
		},
	},
	spacing: {
		xs: "4px",
		sm: "8px",
		md: "12px",
		lg: "16px",
		xl: "24px",
	},

	// Helper functions
	getColor(level: ProtectionLevel): string {
		return this.colors[level].primary;
	},

	getIcon(level: ProtectionLevel): string {
		return this.icons[level];
	},

	getLabel(level: ProtectionLevel): string {
		const labelMap: Record<ProtectionLevel, string> = {
			Watched: PROTECTION_LEVEL_SIGNAGE.watch.label,
			Warning: PROTECTION_LEVEL_SIGNAGE.warn.label,
			Protected: PROTECTION_LEVEL_SIGNAGE.block.label,
		};
		return labelMap[level];
	},
};
