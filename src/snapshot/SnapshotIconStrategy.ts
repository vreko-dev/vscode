import * as path from "node:path";

/**
 * Result of icon classification containing the codicon name and theme color
 */
export interface IconResult {
	icon: string;
	color: string; // ThemeColor id
}

/**
 * Metadata describing a snapshot for icon classification
 */
export interface SnapshotMetadata {
	name: string;
	files: string[];
	isProtected: boolean;
}

/**
 * Icon mapping configuration
 */
interface IconMapping {
	icon: string;
	color: string;
}

/**
 * SnapshotIconStrategy classifies snapshots into visual icons based on operation type.
 *
 * This class maps snapshot metadata to VS Code codicons with appropriate colors using
 * a priority-based detection system. Classification is based on:
 * 1. Protected status (highest priority)
 * 2. File extensions
 * 3. Name keyword matching
 * 4. Fallback default icon
 *
 * Performance: Icon classification < 1ms, 10000 classifications < 100ms
 *
 * @example
 * ```typescript
 * const strategy = new SnapshotIconStrategy();
 *
 * // Protected snapshot
 * strategy.classifyIcon({
 *   name: 'Critical feature',
 *   files: ['src/app.ts'],
 *   isProtected: true
 * }); // { icon: 'lock', color: 'charts.red' }
 *
 * // Test file snapshot
 * strategy.classifyIcon({
 *   name: 'Test changes',
 *   files: ['src/app.test.ts'],
 *   isProtected: false
 * }); // { icon: 'beaker', color: 'charts.purple' }
 * ```
 */
export class SnapshotIconStrategy {
	/**
	 * Icon mapping configuration with exact codicon names
	 */
	private static readonly ICON_MAP: Record<string, IconMapping> = {
		"file-add": { icon: "file-add", color: "charts.green" },
		"file-delete": { icon: "trash", color: "charts.red" },
		"test-changes": { icon: "beaker", color: "charts.purple" },
		"update-deps": { icon: "package", color: "charts.yellow" },
		"config-change": {
			icon: "settings-gear",
			color: "debugConsole.warningForeground",
		},
		refactor: { icon: "symbol-class", color: "charts.blue" },
		"fix-bug": { icon: "bug", color: "charts.red" },
		"docs-update": { icon: "book", color: "charts.blue" },
		"style-changes": { icon: "paintcan", color: "charts.pink" },
		"api-changes": { icon: "server", color: "charts.yellow" },
		database: { icon: "database", color: "charts.orange" },
		protected: { icon: "lock", color: "charts.red" },
		default: { icon: "file-code", color: "foreground" },
	};

	/**
	 * Pre-compiled regex patterns for performance optimization
	 */
	private static readonly TEST_FILE_REGEX = /\.(test|spec)\.(ts|js|tsx|jsx)$/i;
	private static readonly CONFIG_FILE_REGEX =
		/\.(config\.(ts|js)|eslintrc|prettierrc|env)/i;
	private static readonly STYLE_FILE_REGEX = /\.(css|scss|less|sass)$/i;
	private static readonly DOC_FILE_REGEX = /\.(md|mdx)$/i;
	private static readonly SQL_FILE_REGEX = /\.sql$/i;
	private static readonly SCHEMA_FILE_REGEX = /schema\.(sql|prisma|ts|js)/i;
	private static readonly API_FILE_REGEX = /\.api\./i;

	/**
	 * Package lock file patterns
	 */
	private static readonly PACKAGE_FILES = new Set([
		"package.json",
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
	]);

	/**
	 * Config file patterns
	 */
	private static readonly CONFIG_FILES = new Set([
		"tsconfig.json",
		".eslintrc.json",
		".prettierrc",
	]);

	/**
	 * Keyword sets for name-based classification (pre-defined for performance)
	 */
	private static readonly BUG_FIX_KEYWORDS = ["fix", "bugfix"];
	private static readonly REFACTOR_KEYWORDS = ["refactor", "refactored"];
	private static readonly ADDITION_KEYWORDS = ["added", "created", "file-add"];
	private static readonly DELETION_KEYWORDS = [
		"deleted",
		"removed",
		"file-delete",
	];
	private static readonly DOC_KEYWORDS = [
		"docs",
		"documentation",
		"docs-update",
	];
	private static readonly STYLE_KEYWORDS = [
		"style",
		"styling",
		"style-changes",
	];
	private static readonly API_KEYWORDS = ["api-changes", "endpoint"];
	private static readonly DATABASE_KEYWORDS = [
		"database",
		"db",
		"migration",
		"schema",
	];
	private static readonly PACKAGE_KEYWORDS = ["update-deps", "dependencies"];
	private static readonly CONFIG_KEYWORDS = ["config-change"];

	/**
	 * Classifies a snapshot into an appropriate icon based on its metadata.
	 *
	 * Detection logic priority order:
	 * 1. Protected status (highest priority)
	 * 2. Name keywords (bug fix, deletion, refactor, etc.)
	 * 3. File extensions (test files, package files, config files, etc.)
	 * 4. Fallback to default icon
	 *
	 * @param metadata - The snapshot metadata to classify
	 * @returns IconResult containing the codicon name and theme color
	 *
	 * @example
	 * ```typescript
	 * const strategy = new SnapshotIconStrategy();
	 *
	 * // Bug fix has priority over test files
	 * strategy.classifyIcon({
	 *   name: 'fix-bug: Test file correction',
	 *   files: ['src/app.test.ts'],
	 *   isProtected: false
	 * }); // { icon: 'bug', color: 'charts.red' }
	 * ```
	 */
	classifyIcon(metadata: SnapshotMetadata): IconResult {
		// Priority 1: Protected status (highest priority)
		if (metadata.isProtected) {
			return SnapshotIconStrategy.ICON_MAP.protected;
		}

		// Priority 2: Name-based keyword matching (specific keywords have priority)
		const nameResult = this.classifyByName(metadata.name);
		if (nameResult) {
			return nameResult;
		}

		// Priority 3: File extension-based classification
		const fileResult = this.classifyByFiles(metadata.files);
		if (fileResult) {
			return fileResult;
		}

		// Priority 4: Fallback to default icon
		return SnapshotIconStrategy.ICON_MAP.default;
	}

	/**
	 * Classifies based on name keywords with priority ordering.
	 *
	 * Priority order (prefix patterns take precedence, then specific operations):
	 * 1. Prefix patterns (KEYWORD: format) - explicit operation type
	 * 2. Bug fixes
	 * 3. Deletions
	 * 4. Refactors
	 * 5. API changes (more specific than generic additions)
	 * 6. Database operations (more specific than generic additions)
	 * 7. Docs
	 * 8. Style
	 * 9. Additions (generic, lower priority unless prefixed)
	 * 10. Package
	 * 11. Config
	 *
	 * @param name - The snapshot name
	 * @returns IconResult if keyword matched, null otherwise
	 */
	private classifyByName(name: string): IconResult | null {
		const lowerName = name.toLowerCase();

		// Priority 0: Check for prefix patterns (conventional commit style: "KEYWORD: description")
		// These explicitly indicate the operation type and should take highest priority
		if (
			this.matchesPrefixKeyword(
				lowerName,
				SnapshotIconStrategy.ADDITION_KEYWORDS,
			)
		) {
			return SnapshotIconStrategy.ICON_MAP["file-add"];
		}
		if (
			this.matchesPrefixKeyword(
				lowerName,
				SnapshotIconStrategy.BUG_FIX_KEYWORDS,
			)
		) {
			return SnapshotIconStrategy.ICON_MAP["fix-bug"];
		}
		if (
			this.matchesPrefixKeyword(
				lowerName,
				SnapshotIconStrategy.DELETION_KEYWORDS,
			)
		) {
			return SnapshotIconStrategy.ICON_MAP["file-delete"];
		}
		if (
			this.matchesPrefixKeyword(
				lowerName,
				SnapshotIconStrategy.REFACTOR_KEYWORDS,
			)
		) {
			return SnapshotIconStrategy.ICON_MAP.refactor;
		}
		if (
			this.matchesPrefixKeyword(lowerName, SnapshotIconStrategy.DOC_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP["docs-update"];
		}
		if (
			this.matchesPrefixKeyword(lowerName, SnapshotIconStrategy.STYLE_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP["style-changes"];
		}
		if (
			this.matchesPrefixKeyword(lowerName, SnapshotIconStrategy.CONFIG_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP["config-change"];
		}

		// Priority 1: Bug fixes (anywhere in name)
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.BUG_FIX_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["fix-bug"];
		}

		// Priority 2: Deletions
		if (
			this.matchesKeyword(lowerName, SnapshotIconStrategy.DELETION_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP["file-delete"];
		}

		// Priority 3: Refactors
		if (
			this.matchesKeyword(lowerName, SnapshotIconStrategy.REFACTOR_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP.refactor;
		}

		// Priority 4: API changes (more specific than generic additions)
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.API_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["api-changes"];
		}

		// Priority 5: Database operations (more specific than generic additions)
		if (
			this.matchesKeyword(lowerName, SnapshotIconStrategy.DATABASE_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP.database;
		}

		// Priority 6: Docs
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.DOC_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["docs-update"];
		}

		// Priority 7: Style
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.STYLE_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["style-changes"];
		}

		// Priority 8: Additions (generic, lower priority unless prefixed)
		if (
			this.matchesKeyword(lowerName, SnapshotIconStrategy.ADDITION_KEYWORDS)
		) {
			return SnapshotIconStrategy.ICON_MAP["file-add"];
		}

		// Priority 9: Package
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.PACKAGE_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["update-deps"];
		}

		// Priority 10: Config
		if (this.matchesKeyword(lowerName, SnapshotIconStrategy.CONFIG_KEYWORDS)) {
			return SnapshotIconStrategy.ICON_MAP["config-change"];
		}

		return null;
	}

	/**
	 * Classifies based on file extensions and paths with priority ordering.
	 *
	 * Priority order:
	 * 1. Test files (.test.ts, .spec.ts, __tests__/)
	 * 2. Package files (package.json, package-lock.json, etc.)
	 * 3. Config files (.config.ts, .eslintrc, etc.)
	 * 4. Documentation files (.md, .mdx, /docs/)
	 * 5. Style files (.css, .scss, .less)
	 * 6. Database files (.sql, /migrations/, /schema/)
	 * 7. API files (.api., /api/)
	 *
	 * @param files - The list of file paths
	 * @returns IconResult if file pattern matched, null otherwise
	 */
	private classifyByFiles(files: string[]): IconResult | null {
		if (!files || files.length === 0) {
			return null;
		}

		// Priority 1: Test files
		if (this.containsTestFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["test-changes"];
		}

		// Priority 2: Package files
		if (this.containsPackageFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["update-deps"];
		}

		// Priority 3: Config files
		if (this.containsConfigFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["config-change"];
		}

		// Priority 4: Documentation files
		if (this.containsDocFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["docs-update"];
		}

		// Priority 5: Style files
		if (this.containsStyleFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["style-changes"];
		}

		// Priority 6: Database files
		if (this.containsDatabaseFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP.database;
		}

		// Priority 7: API files
		if (this.containsApiFiles(files)) {
			return SnapshotIconStrategy.ICON_MAP["api-changes"];
		}

		return null;
	}

	/**
	 * Checks if name matches any of the provided keywords (case-insensitive).
	 *
	 * @param name - The name to check (should be lowercase)
	 * @param keywords - The keywords to match against
	 * @returns true if any keyword is found, false otherwise
	 */
	private matchesKeyword(name: string, keywords: readonly string[]): boolean {
		return keywords.some((k) => name.includes(k));
	}

	/**
	 * Checks if name starts with any of the provided keywords followed by a colon.
	 * This matches conventional commit message format: "KEYWORD: description"
	 *
	 * @param name - The name to check (should be lowercase)
	 * @param keywords - The keywords to match against
	 * @returns true if name starts with keyword + colon pattern, false otherwise
	 */
	private matchesPrefixKeyword(
		name: string,
		keywords: readonly string[],
	): boolean {
		return keywords.some((k) => name.startsWith(`${k}:`));
	}

	/**
	 * Checks if files contain test files (.test.ts, .spec.ts, __tests__/).
	 *
	 * @param files - The file paths to check
	 * @returns true if test files found, false otherwise
	 */
	private containsTestFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			const lowerFile = file.toLowerCase();
			return (
				SnapshotIconStrategy.TEST_FILE_REGEX.test(fileName) ||
				lowerFile.includes("__tests__")
			);
		});
	}

	/**
	 * Checks if files contain package lock files.
	 *
	 * @param files - The file paths to check
	 * @returns true if package files found, false otherwise
	 */
	private containsPackageFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			return SnapshotIconStrategy.PACKAGE_FILES.has(fileName);
		});
	}

	/**
	 * Checks if files contain configuration files.
	 *
	 * @param files - The file paths to check
	 * @returns true if config files found, false otherwise
	 */
	private containsConfigFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			const lowerFile = file.toLowerCase();
			return (
				SnapshotIconStrategy.CONFIG_FILE_REGEX.test(fileName) ||
				SnapshotIconStrategy.CONFIG_FILES.has(fileName) ||
				lowerFile.includes(".env")
			);
		});
	}

	/**
	 * Checks if files contain documentation files (.md, .mdx, /docs/).
	 *
	 * @param files - The file paths to check
	 * @returns true if doc files found, false otherwise
	 */
	private containsDocFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			const lowerFile = file.toLowerCase();
			return (
				SnapshotIconStrategy.DOC_FILE_REGEX.test(fileName) ||
				lowerFile.includes("/docs/") ||
				lowerFile.startsWith("docs/")
			);
		});
	}

	/**
	 * Checks if files contain style files (.css, .scss, .less).
	 *
	 * @param files - The file paths to check
	 * @returns true if style files found, false otherwise
	 */
	private containsStyleFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			return SnapshotIconStrategy.STYLE_FILE_REGEX.test(fileName);
		});
	}

	/**
	 * Checks if files contain database files (.sql, /migrations/, /schema/, schema.*).
	 *
	 * @param files - The file paths to check
	 * @returns true if database files found, false otherwise
	 */
	private containsDatabaseFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			const lowerFile = file.toLowerCase();
			return (
				SnapshotIconStrategy.SQL_FILE_REGEX.test(fileName) ||
				SnapshotIconStrategy.SCHEMA_FILE_REGEX.test(fileName) ||
				lowerFile.includes("/migrations/") ||
				lowerFile.startsWith("migrations/") ||
				lowerFile.includes("/schema/") ||
				lowerFile.startsWith("schema/")
			);
		});
	}

	/**
	 * Checks if files contain API files (.api., /api/).
	 *
	 * @param files - The file paths to check
	 * @returns true if API files found, false otherwise
	 */
	private containsApiFiles(files: string[]): boolean {
		return files.some((file) => {
			const fileName = path.basename(file);
			const lowerFile = file.toLowerCase();
			return (
				SnapshotIconStrategy.API_FILE_REGEX.test(fileName) ||
				lowerFile.includes("/api/") ||
				lowerFile.startsWith("api/")
			);
		});
	}
}
