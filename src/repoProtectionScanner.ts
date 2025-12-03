import * as path from "node:path";
import { glob } from "fast-glob";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "./services/protectedFileRegistry.js";
import type { SnapBackRC } from "./types/snapbackrc.types";
import { toError } from "./utils/errorHelpers.js";
import { logger } from "./utils/logger.js";
import type { ProtectionLevel } from "./views/types.js";

interface FileProtectionRecommendation {
	filePath: string;
	recommendedLevel: ProtectionLevel;
	reason: string;
	category: string;
	fileType: string;
}

interface RecommendationQuickPickItem extends vscode.QuickPickItem {
	recommendation: FileProtectionRecommendation | null;
	category: string;
}

export class RepoProtectionScanner {
	constructor(
		private readonly protectedFileRegistry: ProtectedFileRegistry,
		private readonly workspaceRoot: string,
		private readonly snapbackConfig?: SnapBackRC,
	) {}

	/**
	 * Scan the entire repository and recommend protection levels for files
	 */
	async scanRepository(
		useDeepAnalysis: boolean = false,
	): Promise<FileProtectionRecommendation[]> {
		const recommendations: FileProtectionRecommendation[] = [];

		// Get all files in the workspace
		const files = await this.getAllWorkspaceFiles();

		// Categorize files and recommend protection levels
		for (const file of files) {
			const recommendation = this.getProtectionRecommendation(
				file,
				useDeepAnalysis,
			);
			if (recommendation) {
				recommendations.push(recommendation);
			}
		}

		return recommendations;
	}

	/**
	 * Apply recommended protection levels to files
	 */
	async applyRecommendations(
		recommendations: FileProtectionRecommendation[],
	): Promise<void> {
		let protectedCount = 0;
		for (const recommendation of recommendations) {
			try {
				// Check if file is already protected
				const isProtected = this.protectedFileRegistry.isProtected(
					recommendation.filePath,
				);
				if (!isProtected) {
					// Protect the file with the recommended level
					await this.protectedFileRegistry.add(recommendation.filePath, {
						protectionLevel: recommendation.recommendedLevel,
					});
					protectedCount++;
				} else {
					// Update protection level if different
					const currentLevel = this.protectedFileRegistry.getProtectionLevel(
						recommendation.filePath,
					);
					if (currentLevel !== recommendation.recommendedLevel) {
						await this.protectedFileRegistry.updateProtectionLevel(
							recommendation.filePath,
							recommendation.recommendedLevel,
						);
						protectedCount++;
					}
				}
			} catch (error) {
				logger.error(
					`Failed to protect file ${recommendation.filePath}:`,
					toError(error),
				);
			}
		}

		vscode.window.showInformationMessage(
			`Applied protection to ${protectedCount} files`,
		);
	}

	/**
	 * Show a quick pick interface for users to review and apply recommendations
	 */
	async showRecommendationsQuickPick(
		recommendations: FileProtectionRecommendation[],
	): Promise<void> {
		// Group recommendations by category
		const categories: Record<string, FileProtectionRecommendation[]> = {};
		for (const rec of recommendations) {
			if (!categories[rec.category]) {
				categories[rec.category] = [];
			}
			categories[rec.category].push(rec);
		}

		// Create quick pick items with category separators
		const items: RecommendationQuickPickItem[] = [];

		// Add "Select All" option at the top
		items.push({
			label: "$(check-all) Select All Recommendations",
			description: `Apply all ${recommendations.length} recommended protections`,
			recommendation: null as FileProtectionRecommendation | null,
			category: "selectAll",
			picked: true,
		});

		// Add category separators and items
		for (const [category, recs] of Object.entries(categories)) {
			// Add category separator
			items.push({
				label: category,
				kind: vscode.QuickPickItemKind.Separator,
				recommendation: null as FileProtectionRecommendation | null,
				category: "",
			});

			// Add items in this category
			for (const rec of recs) {
				items.push({
					label: `${this.getProtectionIcon(
						rec.recommendedLevel,
					)} ${path.basename(rec.filePath)}`,
					description: this.getRelativePath(rec.filePath),
					detail: `${rec.reason} - ${rec.recommendedLevel}`,
					recommendation: rec,
					category: rec.category,
					picked: true,
				});
			}
		}

		const selectedItems = await vscode.window.showQuickPick(items, {
			placeHolder: "Select files to protect (default: all recommended)",
			canPickMany: true,
			matchOnDescription: true,
			matchOnDetail: true,
		});

		if (selectedItems && selectedItems.length > 0) {
			// Check if "Select All" was chosen
			const selectAllItem = selectedItems.find(
				(item) => item.category === "selectAll",
			);

			if (selectAllItem) {
				// Apply all recommendations
				await this.applyRecommendations(recommendations);
			} else {
				// Apply only selected recommendations
				const selectedRecommendations = selectedItems
					.filter((item) => item.recommendation)
					.map((item) => item.recommendation as FileProtectionRecommendation);

				if (selectedRecommendations.length > 0) {
					await this.applyRecommendations(selectedRecommendations);
				} else {
					vscode.window.showInformationMessage(
						"No files selected for protection",
					);
				}
			}
		} else {
			vscode.window.showInformationMessage("Repository protection cancelled");
		}
	}

	private async getAllWorkspaceFiles(): Promise<string[]> {
		try {
			// Use fast-glob to find all files in the workspace
			const pattern = path.join(this.workspaceRoot, "**/*");
			const entries = await glob(pattern, {
				ignore: [
					"**/node_modules/**",
					"**/.git/**",
					"**/dist/**",
					"**/build/**",
					"**/.snapback/**",
					"**/.vscode/**",
					"**/.next/**",
					"**/out/**",
					"**/.DS_Store",
					"**/Thumbs.db",
				],
				onlyFiles: true,
				absolute: true,
			});

			return entries.filter((file) => this.isFileRelevant(file));
		} catch (error) {
			logger.error("Error scanning workspace files:", toError(error));
			return [];
		}
	}

	private isFileRelevant(filePath: string): boolean {
		// Filter out binary files and other non-relevant files
		const ignoredExtensions = [
			".jpg",
			".jpeg",
			".png",
			".gif",
			".bmp",
			".ico",
			".svg",
			".pdf",
			".doc",
			".docx",
			".xls",
			".xlsx",
			".zip",
			".tar",
			".gz",
			".rar",
			".7z",
			".exe",
			".dll",
			".so",
			".dylib",
			".app",
			".mp3",
			".mp4",
			".avi",
			".mov",
			".wav",
			".ttf",
			".otf",
			".woff",
			".woff2",
		];

		const ext = path.extname(filePath).toLowerCase();
		return !ignoredExtensions.includes(ext);
	}

	private getProtectionRecommendation(
		filePath: string,
		useDeepAnalysis: boolean = false,
	): FileProtectionRecommendation | null {
		const fileName = path.basename(filePath).toLowerCase();
		const relativePath = this.getRelativePath(filePath).toLowerCase();
		const ext = path.extname(filePath).toLowerCase();

		// H2: Use merged config patterns if available (config-driven, not hardcoded)
		if (this.snapbackConfig?.protection) {
			for (const rule of this.snapbackConfig.protection) {
				// Check if file path matches the pattern
				if (this.matchesPattern(filePath, rule.pattern)) {
					return {
						filePath,
						recommendedLevel: rule.level,
						reason: rule.reason || "Matches protection rule",
						category: this.getCategoryFromLevel(rule.level),
						fileType: "config",
					};
				}
			}
		}

		// Fallback: High-risk files that should be blocked
		if (
			fileName === ".env" ||
			fileName.startsWith(".env.") ||
			fileName === "credentials.json" ||
			fileName === "secrets.json" ||
			fileName === "private.key" ||
			fileName === "id_rsa" ||
			fileName === "access_tokens.db" ||
			fileName === "firebase-service-account.json" ||
			relativePath.includes("secret") ||
			relativePath.includes("private") ||
			relativePath.includes("credential")
		) {
			return {
				filePath,
				recommendedLevel: "Protected",
				reason: "Contains sensitive credentials",
				category: "🔐 Sensitive Credentials",
				fileType: "credentials",
			};
		}

		// Fallback: Medium-risk configuration files that should have warnings
		if (
			fileName === "package.json" ||
			fileName === "package-lock.json" ||
			fileName === "yarn.lock" ||
			fileName === "pnpm-lock.yaml" ||
			fileName === "tsconfig.json" ||
			fileName === "webpack.config.js" ||
			fileName === "vite.config.js" ||
			fileName === "docker-compose.yml" ||
			fileName === "Dockerfile" ||
			fileName === "dockerfile" ||
			fileName === "Makefile" ||
			fileName === "pom.xml" ||
			fileName === "build.gradle" ||
			fileName === "requirements.txt" ||
			fileName === "gemfile" ||
			fileName === "composer.json" ||
			relativePath.includes("config") ||
			relativePath.includes("database/schema") ||
			ext === ".config" ||
			ext === ".conf" ||
			ext === ".ini" ||
			ext === ".yaml" ||
			ext === ".yml"
		) {
			return {
				filePath,
				recommendedLevel: "Warning",
				reason: "Critical configuration file",
				category: "⚙️ Configuration Files",
				fileType: "config",
			};
		}

		// If deep analysis is enabled, look for additional patterns
		if (useDeepAnalysis) {
			// Look for database migration files
			if (
				relativePath.includes("migration") ||
				relativePath.includes("migrate") ||
				fileName.includes("migration") ||
				fileName.includes("migrate") ||
				(ext === ".sql" && relativePath.includes("db"))
			) {
				return {
					filePath,
					recommendedLevel: "Warning",
					reason: "Database migration file",
					category: "🗄️ Database Files",
					fileType: "migration",
				};
			}

			// Look for CI/CD configuration files
			if (
				fileName === ".github" ||
				fileName === ".gitlab-ci.yml" ||
				fileName === "jenkinsfile" ||
				fileName === "bitbucket-pipelines.yml" ||
				relativePath.includes("ci") ||
				relativePath.includes("cicd")
			) {
				return {
					filePath,
					recommendedLevel: "Warning",
					reason: "CI/CD configuration file",
					category: "🚀 CI/CD Files",
					fileType: "ci",
				};
			}

			// Look for infrastructure files
			if (
				fileName === "terraform.tf" ||
				fileName === "main.tf" ||
				fileName.endsWith(".tf") ||
				fileName === "cloudformation.yaml" ||
				fileName === "serverless.yml" ||
				relativePath.includes("k8s") ||
				relativePath.includes("kubernetes") ||
				relativePath.includes("helm") ||
				relativePath.includes("infrastructure")
			) {
				return {
					filePath,
					recommendedLevel: "Warning",
					reason: "Infrastructure configuration file",
					category: "🏗️ Infrastructure Files",
					fileType: "infrastructure",
				};
			}
		}

		// Source code files that should be watched
		if (
			ext === ".ts" ||
			ext === ".tsx" ||
			ext === ".js" ||
			ext === ".jsx" ||
			ext === ".py" ||
			ext === ".java" ||
			ext === ".cs" ||
			ext === ".go" ||
			ext === ".rs" ||
			ext === ".cpp" ||
			ext === ".c" ||
			ext === ".h" ||
			ext === ".hpp" ||
			ext === ".swift" ||
			ext === ".kt" ||
			ext === ".php" ||
			ext === ".rb" ||
			ext === ".pl" ||
			ext === ".sh" ||
			ext === ".sql"
		) {
			return {
				filePath,
				recommendedLevel: "Watched",
				reason: "Source code file",
				category: "📄 Source Code",
				fileType: "source",
			};
		}

		// Documentation files that should be watched
		if (
			ext === ".md" ||
			ext === ".txt" ||
			ext === ".rst" ||
			ext === ".adoc" ||
			ext === ".wiki" ||
			fileName === "readme" ||
			fileName === "changelog" ||
			fileName === "license" ||
			fileName === "contributing"
		) {
			return {
				filePath,
				recommendedLevel: "Watched",
				reason: "Documentation file",
				category: "📚 Documentation",
				fileType: "docs",
			};
		}

		// No recommendation for other files
		return null;
	}

	private getProtectionIcon(level: ProtectionLevel): string {
		switch (level) {
			case "Watched":
				return "\u{1f7e2}";
			case "Warning":
				return "\u{26a0}";
			case "Protected":
				return "\u{1f6d1}";
			default:
				return "\u{1f7e2}";
		}
	}

	private getRelativePath(filePath: string): string {
		return path.relative(this.workspaceRoot, filePath);
	}

	/**
	 * Check if file path matches glob pattern (reuse from SnapBackRCLoader logic)
	 */
	private matchesPattern(filePath: string, pattern: string): boolean {
		const relativePath = this.getRelativePath(filePath);
		try {
			return minimatch(relativePath, pattern, {
				dot: true,
				windowsPathsNoEscape: true,
			});
		} catch (error) {
			logger.warn(
				`Failed to match pattern "${pattern}"`,
				error instanceof Error ? error.message : error,
			);
			return false;
		}
	}

	/**
	 * Get category label from protection level
	 */
	private getCategoryFromLevel(level: ProtectionLevel): string {
		switch (level) {
			case "Protected":
				return "🔐 Sensitive Credentials";
			case "Warning":
				return "⚙️ Configuration Files";
			default:
				return "📄 Source Code";
		}
	}
}
