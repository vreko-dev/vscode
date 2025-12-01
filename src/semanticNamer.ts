/**
 * @fileoverview Semantic Snapshot Namer - Generates human-readable snapshot names
 *
 * This module provides intelligent naming for snapshots based on file changes
 * and diff analysis. It uses pattern matching and heuristics to create meaningful
 * names without requiring AI/LLM processing.
 */

export enum ChangeType {
	DEPENDENCY_UPDATE = "dependency-update",
	CONFIG_CHANGE = "config-change",
	REFACTORING = "refactoring",
	FEATURE_ADDITION = "feature-addition",
	BUG_FIX = "bug-fix",
	TYPESCRIPT_MIGRATION = "typescript-migration",
	BUILD_SETUP = "build-setup",
	LARGE_REFACTOR = "large-refactor",
}

export interface SnapshotMetadata {
	timestamp: Date;
	semanticName: string; // Human-readable
	trigger: "manual" | "auto" | "ai-activity" | "git-hook";
	changeType: ChangeType;
	filesAffected: string[];
	aiToolDetected?: string;
}

/**
 * Analysis results from change detection
 */
interface ChangeAnalysis {
	isDependencyChange: boolean;
	isConfigChange: boolean;
	isMigration: boolean;
	isFeatureAddition: boolean;
	isBugFix: boolean;
	isBuildSetup: boolean;
	isRefactoring: boolean;
	changedPackages: string[];
	configFiles: string[];
	newFiles: number;
	deletedFiles: number;
	modifiedFiles: number;
	linesChanged: number;
	files: string[];
	diff: string;
	filesAffected: string[];
}

/**
 * Generates semantic snapshot names based on file changes and diff analysis
 * using pattern matching and heuristics without requiring AI/LLM processing.
 */
export class SemanticSnapshotNamer {
	/**
	 * Generate a semantic name for a snapshot based on the diff and changed files
	 * @param diff The git diff content
	 * @param changedFiles Array of file paths that were changed
	 * @returns A human-readable semantic name for the snapshot
	 */
	generateName(diff: string, changedFiles: string[]): string {
		const analysis = this.analyzeChanges(diff, changedFiles);

		// Priority-based naming (most specific first)
		if (analysis.isDependencyChange) {
			return this.nameDependencyChange(analysis);
		}

		// Specific config files should take precedence over build setup
		if (analysis.isConfigChange) {
			return this.nameConfigChange(analysis);
		}

		// Check for build setup changes
		if (analysis.isBuildSetup) {
			return this.nameBuildSetup(analysis);
		}

		if (analysis.isMigration) {
			return this.nameMigration(analysis);
		}

		if (analysis.isFeatureAddition) {
			return this.nameFeature(analysis);
		}

		if (analysis.isBugFix) {
			return this.nameBugFix(analysis);
		}

		// Check for advanced refactoring patterns
		if (this.checkAdvancedRefactoring(diff, changedFiles)) {
			return this.nameAdvancedRefactoring(analysis);
		}

		if (analysis.isRefactoring) {
			return this.nameRefactoring(analysis);
		}

		// Fallback to file-based naming
		return this.nameByFiles(changedFiles);
	}

	/**
	 * Analyze changes to determine the type of change
	 * @param diff The git diff content
	 * @param files Array of file paths that were changed
	 * @returns Analysis results
	 */
	private analyzeChanges(diff: string, files: string[]) {
		return {
			isDependencyChange: this.checkDependencyChanges(files, diff),
			isConfigChange: this.checkConfigChanges(files),
			isMigration: this.checkMigration(files, diff),
			isFeatureAddition: this.checkFeatureAddition(files, diff),
			isBugFix: this.checkBugFix(files, diff),
			isBuildSetup: this.checkBuildSetup(files),
			isRefactoring: this.checkRefactoring(files, diff),
			changedPackages: this.extractPackageChanges(diff),
			configFiles: this.extractConfigFiles(files),
			newFiles: this.countNewFiles(diff),
			deletedFiles: this.countDeletedFiles(diff),
			modifiedFiles: files.length,
			linesChanged: this.countLinesChanged(diff),
			files: files,
			diff: diff,
			filesAffected: files,
		};
	}

	/**
	 * Check if the changes involve dependency updates
	 * @param files Array of file paths that were changed
	 * @param diff The git diff content
	 * @returns True if dependency changes are detected
	 */
	private checkDependencyChanges(files: string[], diff: string): boolean {
		const depFiles = [
			"package.json",
			"package-lock.json",
			"yarn.lock",
			"pnpm-lock.yaml",
		];
		const isPackageJson = files.some((f) =>
			depFiles.includes(this.getBaseName(f)),
		);

		// If it's package.json, check if the changes are in dependencies or scripts
		if (isPackageJson) {
			// If the diff contains "scripts" section changes, it's build setup, not dependency change
			if (
				diff.includes('"scripts"') ||
				diff.includes("build") ||
				diff.includes("test")
			) {
				return false; // Let build setup detection handle this
			}
			// If the diff contains "dependencies" or "devDependencies", it's a dependency change
			return (
				diff.includes('"dependencies"') || diff.includes('"devDependencies"')
			);
		}

		// For other lock files, it's always a dependency change
		return files.some((f) =>
			["package-lock.json", "yarn.lock", "pnpm-lock.yaml"].includes(
				this.getBaseName(f),
			),
		);
	}

	/**
	 * Generate a name for dependency changes
	 * @param analysis Analysis results
	 * @returns Semantic name for dependency changes
	 */
	private nameDependencyChange(analysis: {
		changedPackages: string[];
	}): string {
		const packages = analysis.changedPackages;
		if (packages.length === 1) {
			return `updated-${packages[0]}`;
		}
		if (packages.length > 5) {
			return "major-dependency-upgrade";
		}
		if (packages.length > 1) {
			return `updated-${packages.length}-packages`;
		}
		return "dependency-update";
	}

	/**
	 * Check if the changes involve configuration files
	 * @param files Array of file paths that were changed
	 * @returns True if config changes are detected
	 */
	private checkConfigChanges(files: string[]): boolean {
		const configPatterns = [
			"tsconfig.json",
			".env",
			"jest.config",
			"babel.config",
			".eslintrc",
		];

		// Exclude build tool config files from general config detection
		const buildConfigFiles = [
			"webpack.config",
			"vite.config",
			"rollup.config",
			"gulpfile",
			"gruntfile",
		];

		return files.some((f) => {
			const isGeneralConfig = configPatterns.some((pattern) =>
				f.includes(pattern),
			);
			const isBuildConfig = buildConfigFiles.some((pattern) =>
				f.includes(pattern),
			);
			// Only return true for general config files, not build config files
			return isGeneralConfig && !isBuildConfig;
		});
	}

	/**
	 * Generate a name for configuration changes
	 * @param analysis Analysis results
	 * @returns Semantic name for config changes
	 */
	private nameConfigChange(analysis: { configFiles: string[] }): string {
		const configs = analysis.configFiles;
		if (configs.find((f: string) => f.includes("tsconfig.json")))
			return "typescript-config-update";
		if (configs.some((f: string) => f.includes(".env")))
			return "environment-config-change";
		return "config-update";
	}

	/**
	 * Check if the changes involve code migration
	 * @param files Array of file paths that were changed
	 * @param diff The git diff content
	 * @returns True if migration is detected
	 */
	private checkMigration(files: string[], diff: string): boolean {
		// Check for JS to TS migration
		const hasNewTS = files.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
		const hasDeletedJS = diff.includes("deleted file") && diff.includes(".js");

		if (hasNewTS && hasDeletedJS) return true;

		// Check for React migration patterns
		if (diff.includes("useState") && diff.includes("useEffect")) return true;

		return false;
	}

	/**
	 * Generate a name for migration changes
	 * @param analysis Analysis results
	 * @returns Semantic name for migration
	 */
	private nameMigration(analysis: ChangeAnalysis): string {
		if (analysis.newFiles > 10) return "large-scale-migration";
		return "code-migration";
	}

	/**
	 * Check if the changes involve feature additions
	 * @param files Array of file paths that were changed
	 * @param diff The git diff content
	 * @returns True if feature addition is detected
	 */
	private checkFeatureAddition(files: string[], diff: string): boolean {
		const newFilesCount = this.countNewFiles(diff);
		const hasNewComponents = files.some(
			(f) => f.includes("/components/") || f.includes("/features/"),
		);
		return newFilesCount > 3 && hasNewComponents;
	}

	/**
	 * Generate a name for feature additions
	 * @param analysis Analysis results
	 * @returns Semantic name for feature additions
	 */
	private nameFeature(analysis: ChangeAnalysis): string {
		// Try to extract feature name from folder structure
		const featureFiles = analysis.files.filter(
			(f: string) => f.includes("/features/") || f.includes("/components/"),
		);

		if (featureFiles.length > 0) {
			const featureName = this.extractFeatureName(featureFiles[0]);
			// Remove file extension from feature name
			const cleanName = featureName.replace(/\.[^/.]+$/, "");
			return `added-${cleanName}`;
		}

		return "new-feature";
	}

	/**
	 * Check if the changes involve bug fixes
	 * @param files Array of file paths that were changed
	 * @param diff The git diff content
	 * @returns True if bug fix patterns are detected
	 */
	private checkBugFix(files: string[], diff: string): boolean {
		// Look for common bug fix patterns in the diff
		const bugFixPatterns = [
			/fix/i,
			/bug/i,
			/error/i,
			/correct/i,
			/resolve/i,
			/\bfix(es)?\b/i,
			/hotfix/i,
		];

		// Check if any file name suggests a bug fix
		const bugFixFilePatterns = [/fix/i, /bug/i, /patch/i, /hotfix/i];

		// Check file names
		const hasBugFixFileName = files.some((file) =>
			bugFixFilePatterns.some((pattern) => pattern.test(file)),
		);

		// Check diff content for bug fix keywords
		const hasBugFixInDiff = bugFixPatterns.some((pattern) =>
			pattern.test(diff),
		);

		// Look for specific code change patterns that suggest bug fixes
		const hasBugFixCodePatterns =
			diff.includes("// fix") ||
			diff.includes("// bug") ||
			diff.includes("/* fix") ||
			diff.includes("/* bug") ||
			diff.includes("TODO" + ": fix") ||
			diff.includes("FIXME:") ||
			diff.includes("BUG:") ||
			diff.includes("HOTFIX:");

		return hasBugFixFileName || hasBugFixInDiff || hasBugFixCodePatterns;
	}

	/**
	 * Generate a name for bug fix changes
	 * @param analysis Analysis results
	 * @returns Semantic name for bug fixes
	 */
	private nameBugFix(analysis: ChangeAnalysis): string {
		// Try to extract specific bug information from the diff
		if (analysis.diff.includes("BUG:") || analysis.diff.includes("FIXME:")) {
			// Try to extract the bug description
			const bugMatch = analysis.diff.match(/(?:BUG:|FIXME:)\s*([^\n]+)/i);
			if (bugMatch?.[1]) {
				const bugDescription = bugMatch[1]
					.trim()
					.replace(/\s+/g, "-")
					.toLowerCase();
				// Limit the length to keep names reasonable
				return `fixed-${bugDescription.substring(0, 30)}`;
			}
		}

		// Try to extract component name from file paths
		if (analysis.files && analysis.files.length > 0) {
			const firstFile = analysis.files[0];
			const componentName = this.extractComponentName(firstFile);
			if (componentName) {
				return `fixed-${componentName}`;
			}
		}

		return "bug-fix";
	}

	/**
	 * Extract component name from file path
	 * @param filePath The file path
	 * @returns Component name
	 */
	private extractComponentName(filePath: string): string {
		// Try to extract component name from common patterns
		const componentPatterns = [
			/\/components\/([^/]+)/,
			/\/modules\/([^/]+)/,
			/\/features\/([^/]+)/,
			/\/services\/([^/]+)/,
			/\/utils\/([^/]+)/,
		];

		for (const pattern of componentPatterns) {
			const match = filePath.match(pattern);
			if (match?.[1]) {
				// If the match contains a file extension, remove it
				const component = match[1];
				if (component.includes(".")) {
					return component.split(".")[0];
				}
				return component;
			}
		}

		// Fallback to file name without extension
		const baseName = this.getBaseName(filePath);
		if (baseName.includes(".")) {
			return baseName.split(".")[0];
		}
		return baseName;
	}

	/**
	 * Check if the changes involve build setup files
	 * @param files Array of file paths that were changed
	 * @returns True if build setup changes are detected
	 */
	private checkBuildSetup(files: string[]): boolean {
		const buildFiles = [
			"webpack.config.js",
			"webpack.config.ts",
			"vite.config.js",
			"vite.config.ts",
			"rollup.config.js",
			"rollup.config.ts",
			"gulpfile.js",
			"gulpfile.ts",
			"gruntfile.js",
			"gruntfile.ts",
			"package.json",
			"tsconfig.json",
			"babel.config.js",
			"babel.config.ts",
			"jest.config.js",
			"jest.config.ts",
			"eslint.config.js",
			".eslintrc.js",
			".eslintrc.json",
			"dockerfile",
			"Dockerfile",
			"docker-compose.yml",
			"docker-compose.yaml",
			".dockerignore",
			"Makefile",
			"CMakeLists.txt",
			"pom.xml",
			"build.gradle",
			"build.gradle.kts",
		];

		return files.some((file) => {
			const fileName = file.toLowerCase();
			return buildFiles.some((buildFile) =>
				fileName.includes(buildFile.toLowerCase()),
			);
		});
	}

	/**
	 * Generate a name for build setup changes
	 * @param analysis Analysis results
	 * @returns Semantic name for build setup changes
	 */
	private nameBuildSetup(analysis: ChangeAnalysis): string {
		// Try to identify specific build tools that were changed
		const buildToolPatterns = [
			{ pattern: /webpack/i, name: "webpack" },
			{ pattern: /vite/i, name: "vite" },
			{ pattern: /rollup/i, name: "rollup" },
			{ pattern: /gulp/i, name: "gulp" },
			{ pattern: /grunt/i, name: "grunt" },
			{ pattern: /babel/i, name: "babel" },
			{ pattern: /jest/i, name: "jest" },
			{ pattern: /eslint/i, name: "eslint" },
			{ pattern: /docker/i, name: "docker" },
			{ pattern: /make/i, name: "make" },
			{ pattern: /cmake/i, name: "cmake" },
			{ pattern: /maven/i, name: "maven" },
			{ pattern: /gradle/i, name: "gradle" },
		];

		// Check which build tools are affected
		const affectedTools = buildToolPatterns.filter((tool) =>
			analysis.files.some((file: string) => tool.pattern.test(file)),
		);

		if (affectedTools.length === 1) {
			return `build-setup-${affectedTools[0].name}`;
		}

		if (affectedTools.length > 1) {
			return "build-setup-multi-tool";
		}

		// Check for specific file types
		if (
			analysis.files.some(
				(file: string) =>
					file.includes("Dockerfile") || file.includes("docker"),
			)
		) {
			return "build-setup-docker";
		}

		if (analysis.files.some((file: string) => file.includes("package.json"))) {
			return "build-setup-npm";
		}

		if (analysis.files.some((file: string) => file.includes("tsconfig.json"))) {
			return "build-setup-typescript";
		}

		return "build-setup-change";
	}

	/**
	 * Check if the changes involve refactoring
	 * @param files Array of file paths that were changed
	 * @param diff The git diff content
	 * @returns True if refactoring is detected
	 */
	private checkRefactoring(files: string[], diff: string): boolean {
		// Special case: file renaming
		if (diff.includes("rename from") && diff.includes("rename to")) {
			return true;
		}

		// Check for specific refactoring patterns
		const refactoringPatterns = [
			// Function/variable renaming patterns
			/(?:function|const|let|var)\s+(\w+)\s*=/i,
			// Class renaming patterns
			/class\s+(\w+)/i,
			// Import/export restructuring
			/import\s+{[^}]*}/i,
			/export\s+{[^}]*}/i,
			// Component restructuring
			/(?:extends|implements)\s+\w+/i,
		];

		const hasRefactoringPatterns = refactoringPatterns.some((pattern) =>
			pattern.test(diff),
		);

		const ratio = this.countLinesChanged(diff) / Math.max(files.length, 1);
		const hasNoNewFiles = this.countNewFiles(diff) === 0;
		const hasNoDeletedFiles = this.countDeletedFiles(diff) === 0;

		// High line changes but no new/deleted files = likely refactoring
		const isHighChangeRatio = ratio > 20 && hasNoNewFiles && hasNoDeletedFiles;

		return isHighChangeRatio || hasRefactoringPatterns;
	}

	/**
	 * Generate a name for refactoring changes
	 * @param analysis Analysis results
	 * @returns Semantic name for refactoring
	 */
	private nameRefactoring(analysis: ChangeAnalysis): string {
		if (analysis.filesAffected && analysis.filesAffected.length > 10)
			return "large-refactoring";

		// Check for common refactoring patterns
		if (
			analysis.diff.includes("rename from") &&
			analysis.diff.includes("rename to")
		) {
			return "renamed-files";
		}

		// Check for specific refactoring types
		if (
			analysis.diff.includes("class ") &&
			analysis.diff.includes("extends ")
		) {
			return "class-restructure";
		}

		if (
			analysis.diff.includes("import {") ||
			analysis.diff.includes("export {")
		) {
			return "module-restructure";
		}

		if (
			analysis.diff.includes("function ") ||
			analysis.diff.includes("const ")
		) {
			// Check if it's a significant function refactoring
			const functionCount = (
				analysis.diff.match(/function\s+\w+|const\s+\w+\s*=/g) || []
			).length;
			if (functionCount > 3) {
				return "function-refactor";
			}
		}

		if (analysis.diff.includes("move")) return "restructured-code";

		return "refactoring";
	}

	/**
	 * Check for advanced refactoring patterns
	 * @param diff The git diff content
	 * @param files Array of file paths that were changed
	 * @returns True if advanced refactoring patterns are detected
	 */
	private checkAdvancedRefactoring(diff: string, files: string[]): boolean {
		// Look for more sophisticated refactoring patterns in the diff
		const architecturePatterns = [/\bmvc\b/i, /\bmvp\b/i, /\bmvvm\b/i];

		const designPatterns = [
			/\bsingleton\b/i,
			/\bfactory\b/i,
			/\bobserver\b/i,
			/\bstrategy\b/i,
		];

		const performancePatterns = [
			/\bmemoize\b/i,
			/\bcache\b/i,
			/\bdebounce\b/i,
			/\bthrottle\b/i,
			/\bmemoization\b/i,
		];

		const organizationPatterns = [
			/\bnamespace\b/i,
			/\bmodule\b/i,
			/\bpackage\b/i,
		];

		// Check if any advanced patterns are in the diff
		const hasArchitecture = architecturePatterns.some((pattern) =>
			pattern.test(diff),
		);
		const hasDesign = designPatterns.some((pattern) => pattern.test(diff));
		const hasPerformance = performancePatterns.some((pattern) =>
			pattern.test(diff),
		);
		const hasOrganization = organizationPatterns.some((pattern) =>
			pattern.test(diff),
		);

		// Also check file names for refactoring indicators
		const refactoringFilePatterns = [/refactor/i, /restructure/i, /optimize/i];

		const hasRefactoringFiles = files.some((file) =>
			refactoringFilePatterns.some((pattern) => pattern.test(file)),
		);

		return (
			hasArchitecture ||
			hasDesign ||
			hasPerformance ||
			hasOrganization ||
			hasRefactoringFiles
		);
	}

	/**
	 * Generate a name for advanced refactoring
	 * @param analysis Analysis results
	 * @returns Semantic name for advanced refactoring
	 */
	private nameAdvancedRefactoring(analysis: ChangeAnalysis): string {
		// Check for architecture refactoring (contains MVC/MVP/MVVM patterns)
		const architecturePatterns = [/\bmvc\b/i, /\bmvp\b/i, /\bmvvm\b/i];

		const hasArchitecture = architecturePatterns.some((pattern) =>
			pattern.test(analysis.diff),
		);
		if (hasArchitecture) {
			return "architecture-refactor";
		}

		// Check for design pattern refactoring (contains design pattern keywords with "pattern")
		if (
			(analysis.diff.includes("singleton") ||
				analysis.diff.includes("factory") ||
				analysis.diff.includes("observer") ||
				analysis.diff.includes("strategy")) &&
			analysis.diff.includes("pattern")
		) {
			return "design-pattern-refactor";
		}

		// Check for performance refactoring (contains performance-related keywords)
		if (
			(analysis.diff.includes("memoize") ||
				analysis.diff.includes("cache") ||
				analysis.diff.includes("debounce") ||
				analysis.diff.includes("throttle") ||
				analysis.diff.includes("memoization")) &&
			(analysis.diff.includes("performance") ||
				analysis.diff.includes("memoization"))
		) {
			return "performance-refactor";
		}

		// Check for organization refactoring (contains namespace/module/package but not refactored)
		if (
			(analysis.diff.includes("namespace") ||
				analysis.diff.includes("module") ||
				analysis.diff.includes("package")) &&
			!analysis.diff.toLowerCase().includes("refactor")
		) {
			return "organization-refactor";
		}

		return "advanced-refactoring";
	}

	/**
	 * Fallback naming method based on the most significant file
	 * @param files Array of file paths that were changed
	 * @returns Semantic name based on files
	 */
	private nameByFiles(files: string[]): string {
		const mainFile = files[0];
		const baseName = this.getBaseName(mainFile).replace(/\.[^/.]+$/, ""); // Remove extension
		const action = files.length > 1 ? "modified" : "changed";
		return `${action}-${baseName}`;
	}

	/**
	 * Extract package names from diff
	 * @param diff The git diff content
	 * @returns Array of package names that were changed
	 */
	private extractPackageChanges(diff: string): string[] {
		const packages: string[] = [];
		// Updated regex to better match package names
		const packageRegex = /"(@?[a-z0-9-_/]+)":\s*"[^"]*"/gi;
		const matches = diff.matchAll(packageRegex);

		for (const match of matches) {
			// Only add if it's actually a change (not just a line in the file)
			if (match[0].includes('"') && match[0].includes(":")) {
				const packageName = match[1];
				// Better filtering to distinguish real packages from file paths
				if (this.isValidPackageName(packageName)) {
					// Extract just the package name without scope/organization
					const simpleName =
						packageName.startsWith("@") && packageName.includes("/")
							? packageName.split("/")[1]
							: packageName.split("/")[0];
					packages.push(simpleName);
				}
			}
		}

		return [...new Set(packages)].slice(0, 6); // Top 6 unique packages
	}

	/**
	 * Check if a string is a valid package name
	 * @param name The potential package name
	 * @returns True if it's a valid package name
	 */
	private isValidPackageName(name: string): boolean {
		// Valid package names typically follow these rules:
		// - Contain only lowercase letters, numbers, hyphens, underscores, and forward slashes
		// - If scoped (starts with @), must have exactly one slash
		const validPattern = /^(@[a-z0-9-]+\/)?[a-z0-9-_]+(?:\/[a-z0-9-_]+)*$/;

		// Exclude file paths that might look like package names
		const filePathPatterns = [
			/\.json$/i, // Ends with .json
			/\.js$/i, // Ends with .js
			/\.ts$/i, // Ends with .ts
			/\/src\//i, // Contains /src/
			/\/lib\//i, // Contains /lib/
			/\/dist\//i, // Contains /dist/
		];

		// If it doesn't match the valid pattern, it's not a package
		if (!validPattern.test(name)) {
			return false;
		}

		// Check if it matches any file path patterns
		for (const pattern of filePathPatterns) {
			if (pattern.test(name)) {
				return false;
			}
		}

		// If it contains slashes but doesn't start with @, it's likely a file path
		if (name.includes("/") && !name.startsWith("@")) {
			return false;
		}

		return true;
	}

	/**
	 * Extract configuration files from the file list
	 * @param files Array of file paths that were changed
	 * @returns Array of configuration files
	 */
	private extractConfigFiles(files: string[]): string[] {
		return files.filter((f) => f.includes("config") || f.includes(".env"));
	}

	/**
	 * Count new files in the diff
	 * @param diff The git diff content
	 * @returns Number of new files
	 */
	private countNewFiles(diff: string): number {
		return (diff.match(/new file mode/g) || []).length;
	}

	/**
	 * Count deleted files in the diff
	 * @param diff The git diff content
	 * @returns Number of deleted files
	 */
	private countDeletedFiles(diff: string): number {
		return (diff.match(/deleted file mode/g) || []).length;
	}

	/**
	 * Count lines changed in the diff
	 * @param diff The git diff content
	 * @returns Number of lines changed
	 */
	private countLinesChanged(diff: string): number {
		const added = (diff.match(/^\+[^+]/gm) || []).length;
		const removed = (diff.match(/^-[^-]/gm) || []).length;
		return added + removed;
	}

	/**
	 * Extract feature name from file path
	 * @param filePath The file path
	 * @returns Feature name
	 */
	private extractFeatureName(filePath: string): string {
		const parts = filePath.split("/");
		const featureIndex = parts.findIndex(
			(p) => p === "features" || p === "components",
		);
		return parts[featureIndex + 1] || "component";
	}

	/**
	 * Get base name of a file path
	 * @param filePath The file path
	 * @returns Base name of the file
	 */
	private getBaseName(filePath: string): string {
		return filePath.split("/").pop() || filePath;
	}
}
