/**
 * Terminal AI Activity Detector
 *
 * Implements J6-E07: Detect AI tools running in terminal
 *
 * Monitors terminal commands and output for AI CLI tools
 * (Aider, Copilot CLI, Claude, ChatGPT, etc.).
 *
 * @module ai/TerminalAIDetector
 */

/**
 * Terminal activity analysis
 */
export interface TerminalActivity {
	hasAITool: boolean;
	toolName?: string;
	confidence: number;
	command?: string;
}

/**
 * Terminal AI activity detector
 *
 * Detects AI CLI tools through command pattern matching and
 * analyzes terminal output for AI-generated code blocks.
 */
export class TerminalAIDetector {
	// Known AI CLI tools - ordered from most specific to least specific
	private static readonly AI_CLI_TOOLS = [
		// Specific tools first (to avoid generic pattern matches)
		{ pattern: /\baider\b/i, name: "Aider" },
		{ pattern: /\bollama\b/i, name: "Ollama" },
		{ pattern: /\bcontinue\b/i, name: "Continue" },
		{ pattern: /\bcursor\b/i, name: "Cursor" },
		{ pattern: /\bllm\b/i, name: "LLM CLI" },

		// GitHub Copilot
		{ pattern: /\bgh\s+copilot\b/i, name: "GitHub Copilot CLI" },
		{ pattern: /\bcopilot\b/i, name: "GitHub Copilot" },

		// Claude
		{ pattern: /\bclaude\b/i, name: "Claude CLI" },
		{ pattern: /\banthropic\b/i, name: "Anthropic CLI" },

		// ChatGPT/OpenAI
		{ pattern: /\bchatgpt\b/i, name: "ChatGPT" },
		{ pattern: /\bopenai\b/i, name: "OpenAI CLI" },
		{ pattern: /\bgpt\b/i, name: "GPT CLI" },

		// Generic patterns last
		{ pattern: /--model\s+(gpt|claude|llama)/i, name: "AI Model Flag" },
		{ pattern: /OPENAI_API_KEY/i, name: "OpenAI Environment" },
		{ pattern: /ANTHROPIC_API_KEY/i, name: "Anthropic Environment" },
	];

	/**
	 * Analyze terminal command for AI tool usage
	 */
	analyzeCommand(command: string): TerminalActivity {
		for (const tool of TerminalAIDetector.AI_CLI_TOOLS) {
			if (tool.pattern.test(command)) {
				return {
					hasAITool: true,
					toolName: tool.name,
					confidence: 0.9,
					command,
				};
			}
		}

		// Check for pipe patterns that might indicate AI usage
		if (this.hasSuspiciousPipePattern(command)) {
			return {
				hasAITool: true,
				toolName: "Unknown AI Tool",
				confidence: 0.5,
				command,
			};
		}

		return {
			hasAITool: false,
			confidence: 0,
			command,
		};
	}

	/**
	 * Check for pipe patterns that might indicate AI
	 */
	private hasSuspiciousPipePattern(command: string): boolean {
		// Piping to/from curl with AI API endpoints
		if (/curl.*api\.(openai|anthropic)\.com/i.test(command)) {
			return true;
		}

		// Piping output to a file after AI command
		if (/\|\s*tee\s+.*\.(py|js|ts|tsx|jsx|go|rs)$/i.test(command)) {
			return true;
		}

		return false;
	}

	/**
	 * Analyze terminal output for AI-generated content
	 */
	analyzeOutput(output: string): {
		containsGeneratedCode: boolean;
		confidence: number;
		codeBlocks: number;
	} {
		// Count markdown code blocks (common in AI output)
		const codeBlockMatches = output.match(/```[\w]*\n[\s\S]*?```/g) || [];
		const codeBlocks = codeBlockMatches.length;

		if (codeBlocks >= 1) {
			return {
				containsGeneratedCode: true,
				confidence: Math.min(0.9, 0.5 + codeBlocks * 0.1),
				codeBlocks,
			};
		}

		// Check for AI tool signatures in output
		if (/here'?s (the|a|some) code/i.test(output) || /I'?ve (created|generated|written)/i.test(output)) {
			return {
				containsGeneratedCode: true,
				confidence: 0.8,
				codeBlocks: 0,
			};
		}

		return {
			containsGeneratedCode: false,
			confidence: 0,
			codeBlocks: 0,
		};
	}

	/**
	 * Track terminal session for AI activity
	 */
	trackSession(_sessionId: string): {
		aiCommands: number;
		totalCommands: number;
		aiRatio: number;
	} {
		// This would integrate with VSCode terminal API
		// For now, return basic structure
		return {
			aiCommands: 0,
			totalCommands: 0,
			aiRatio: 0,
		};
	}

	/**
	 * Monitor terminal session for AI activity
	 */
	createSessionTracker(): {
		recordCommand: (cmd: string) => void;
		recordOutput: (output: string) => void;
		getActivitySummary: () => {
			aiCommandCount: number;
			aiOutputCount: number;
			tools: string[];
		};
	} {
		const state = {
			commands: [] as TerminalActivity[],
			outputs: [] as { containsGeneratedCode: boolean }[],
			tools: new Set<string>(),
		};

		return {
			recordCommand: (cmd: string) => {
				const analysis = this.analyzeCommand(cmd);
				state.commands.push(analysis);
				if (analysis.toolName) {
					state.tools.add(analysis.toolName);
				}
			},
			recordOutput: (output: string) => {
				const analysis = this.analyzeOutput(output);
				state.outputs.push(analysis);
			},
			getActivitySummary: () => ({
				aiCommandCount: state.commands.filter((c) => c.hasAITool).length,
				aiOutputCount: state.outputs.filter((o) => o.containsGeneratedCode).length,
				tools: Array.from(state.tools),
			}),
		};
	}
}
