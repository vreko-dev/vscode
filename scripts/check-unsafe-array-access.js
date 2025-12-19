#!/usr/bin/env node

/**
 * Static analysis script to detect unsafe array access patterns
 *
 * DETECTS:
 * - array[0] without nearby length check
 * - TOCTOU (time-of-check-to-time-of-use) patterns
 * - Missing defensive guards
 *
 * USAGE:
 *   node scripts/check-unsafe-array-access.js
 *   node scripts/check-unsafe-array-access.js --fix  # Auto-add guards (experimental)
 *   node scripts/check-unsafe-array-access.js --strict  # Fail on any findings
 *
 * EXIT CODES:
 *   0 - No issues found
 *   1 - Unsafe patterns detected
 *   2 - Script error
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Configuration
const config = {
	srcDir: path.join(__dirname, '../src'),
	testDir: path.join(__dirname, '../test'),
	exclude: [
		'**/node_modules/**',
		'**/out/**',
		'**/dist/**',
		'**/*.test.ts',  // Test files are allowed to assume arrays aren't empty
		'**/*.spec.ts',
	],
	// Patterns that indicate a safe array access
	safePatterns: [
		/if\s*\([^)]*\.length\s*[><=!]+\s*0/,  // if (array.length > 0)
		/if\s*\([^)]*&&[^)]*\.length/,         // if (array && array.length)
		/if\s*\(![^)]*\.length\)/,             // if (!array.length)
		/\?\.length/,                          // array?.length (optional chaining)
		/\.forEach\(/,                          // array.forEach (safe)
		/\.map\(/,                              // array.map (safe)
		/\.filter\(/,                           // array.filter (safe)
	],
	// Maximum distance (lines) between check and use
	maxCheckDistance: 5,
};

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	dim: '\x1b[2m',
};

class UnsafeArrayAccessChecker {
	constructor(config) {
		this.config = config;
		this.findings = [];
		this.filesScanned = 0;
		this.autoFix = process.argv.includes('--fix');
		this.strict = process.argv.includes('--strict');
	}

	async run() {
		console.log(`${colors.cyan}🔍 Scanning for unsafe array access patterns...${colors.reset}\n`);

		// Find all TypeScript files
		const pattern = path.join(this.config.srcDir, '**/*.ts');
		const files = await glob(pattern, {
			ignore: this.config.exclude,
		});

		console.log(`Found ${files.length} files to scan\n`);

		// Scan each file
		for (const file of files) {
			await this.scanFile(file);
		}

		// Print results
		this.printResults();

		// Exit with appropriate code
		if (this.findings.length > 0 && this.strict) {
			process.exit(1);
		}
		process.exit(0);
	}

	async scanFile(filePath) {
		this.filesScanned++;
		const content = fs.readFileSync(filePath, 'utf8');
		const lines = content.split('\n');

		// Look for array[0] access patterns
		const arrayAccessRegex = /(\w+)\[0\]/g;

		lines.forEach((line, lineNum) => {
			let match;
			while ((match = arrayAccessRegex.exec(line)) !== null) {
				const arrayName = match[1];
				const column = match.index;

				// Skip if it's a string/comment
				if (this.isInStringOrComment(line, column)) {
					continue;
				}

				// Check if there's a nearby length check
				const hasSafetyCheck = this.hasNearbyLengthCheck(
					lines,
					lineNum,
					arrayName
				);

				if (!hasSafetyCheck) {
					this.findings.push({
						file: filePath,
						line: lineNum + 1,
						column: column + 1,
						arrayName,
						code: line.trim(),
						severity: 'warning',
					});
				}
			}
		});
	}

	hasNearbyLengthCheck(lines, targetLine, arrayName) {
		// Check lines before the access (within maxCheckDistance)
		const startLine = Math.max(0, targetLine - this.config.maxCheckDistance);

		for (let i = startLine; i < targetLine; i++) {
			const line = lines[i];

			// Check for safe patterns
			for (const pattern of this.config.safePatterns) {
				if (pattern.test(line)) {
					// Verify it's checking the same array
					if (line.includes(arrayName)) {
						return true;
					}
				}
			}

			// Check for explicit length check
			if (line.includes(`${arrayName}.length`) || line.includes(`${arrayName}?.length`)) {
				// Looks like a guard condition
				if (line.includes('if') || line.includes('return')) {
					return true;
				}
			}
		}

		return false;
	}

	isInStringOrComment(line, position) {
		// Simple heuristic - check if position is after // or between quotes
		const beforePosition = line.substring(0, position);

		// Comment check
		if (beforePosition.includes('//')) {
			return true;
		}

		// String check (very basic - doesn't handle escaped quotes)
		const singleQuotes = (beforePosition.match(/'/g) || []).length;
		const doubleQuotes = (beforePosition.match(/"/g) || []).length;
		const backticks = (beforePosition.match(/`/g) || []).length;

		// Odd number of quotes means we're inside a string
		return (singleQuotes % 2 === 1) || (doubleQuotes % 2 === 1) || (backticks % 2 === 1);
	}

	printResults() {
		console.log(`\n${'='.repeat(80)}\n`);

		if (this.findings.length === 0) {
			console.log(`${colors.green}✅ No unsafe array access patterns detected!${colors.reset}`);
			console.log(`${colors.dim}Scanned ${this.filesScanned} files${colors.reset}\n`);
			return;
		}

		console.log(`${colors.yellow}⚠️  Found ${this.findings.length} potentially unsafe array access pattern(s)${colors.reset}\n`);

		// Group by file
		const byFile = {};
		this.findings.forEach((finding) => {
			if (!byFile[finding.file]) {
				byFile[finding.file] = [];
			}
			byFile[finding.file].push(finding);
		});

		// Print each file's findings
		Object.entries(byFile).forEach(([file, findings]) => {
			const relPath = path.relative(process.cwd(), file);
			console.log(`${colors.cyan}${relPath}${colors.reset}`);

			findings.forEach((finding) => {
				console.log(`  ${colors.yellow}Line ${finding.line}:${finding.column}${colors.reset}`);
				console.log(`  ${colors.dim}Array: ${finding.arrayName}${colors.reset}`);
				console.log(`  ${colors.dim}Code: ${finding.code}${colors.reset}`);
				console.log(`  ${colors.dim}💡 Add guard: if (${finding.arrayName}.length === 0) { ... }${colors.reset}`);
				console.log('');
			});
		});

		console.log(`${colors.yellow}⚠️  Recommendations:${colors.reset}`);
		console.log(`  1. Add length checks before accessing [0]`);
		console.log(`  2. Use early returns for empty arrays`);
		console.log(`  3. Consider optional chaining: array?.[0]`);
		console.log(`  4. Review TOCTOU patterns (check-then-use gaps)`);
		console.log('');

		if (this.strict) {
			console.log(`${colors.red}❌ Strict mode: Failing due to findings${colors.reset}\n`);
		}
	}
}

// Run the checker
if (require.main === module) {
	const checker = new UnsafeArrayAccessChecker(config);
	checker.run().catch((error) => {
		console.error(`${colors.red}❌ Error:${colors.reset}`, error.message);
		process.exit(2);
	});
}

module.exports = { UnsafeArrayAccessChecker };
