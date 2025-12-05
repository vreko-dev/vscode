#!/usr/bin/env node

/**
 * VSCode Extension VSIX Packaging Script
 *
 * Resolves workspace dependencies for vsce packaging.
 * Creates a temporary package.json with resolved versions, packages VSIX, then restores.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// ANSI colors for output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
	try {
		log(`> ${command}`, "cyan");
		return execSync(command, {
			stdio: "inherit",
			encoding: "utf8",
			...options,
		});
	} catch (error) {
		log(`❌ Command failed: ${command}`, "red");
		throw error;
	}
}

class VSIXPackager {
	constructor() {
		this.extensionRoot = process.cwd();
		this.workspaceRoot = path.resolve(this.extensionRoot, "../..");
		this.originalPackageJson = null;
		this.resolvedPackageJson = null;
		this.backupPath = path.join(
			this.extensionRoot,
			"package.json.packaging-backup",
		);
	}

	resolveVersionFromPnpm(depName) {
		try {
			const result = execSync(`pnpm list ${depName} --depth 0 --json`, {
				cwd: this.extensionRoot,
				encoding: "utf8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			const parsed = JSON.parse(result);
			const dep =
				parsed[0]?.dependencies?.[depName] ||
				parsed[0]?.devDependencies?.[depName];
			return dep?.version;
		} catch (_error) {
			log(`  ⚠ Warning: Could not resolve ${depName} from pnpm`, "yellow");
			return null;
		}
	}

	async resolveWorkspaceDependencies() {
		log("📦 Resolving workspace dependencies...", "blue");

		const packageJsonPath = path.join(this.extensionRoot, "package.json");
		this.originalPackageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, "utf8"),
		);

		// Create a copy for modification
		this.resolvedPackageJson = JSON.parse(
			JSON.stringify(this.originalPackageJson),
		);

		// Preserve enabledApiProposals field
		if (this.originalPackageJson.enabledApiProposals) {
			this.resolvedPackageJson.enabledApiProposals = [
				...this.originalPackageJson.enabledApiProposals,
			];
		}

		// Override vscode:prepublish to skip during packaging (extension is already built)
		// Remove the script entirely to prevent vsce from running it
		if (this.resolvedPackageJson.scripts?.["vscode:prepublish"]) {
			delete this.resolvedPackageJson.scripts["vscode:prepublish"];
			log(
				"  ℹ Removing vscode:prepublish to skip during packaging (already built)",
				"yellow",
			);
		}

		// Resolve workspace:* dependencies
		if (this.resolvedPackageJson.dependencies) {
			for (const [depName, depVersion] of Object.entries(
				this.resolvedPackageJson.dependencies,
			)) {
				if (depVersion === "workspace:*") {
					// For workspace dependencies, use version from the package itself
					const depPackagePath = path.join(
						this.workspaceRoot,
						"packages",
						depName.replace("@snapback/", ""),
						"package.json",
					);
					if (fs.existsSync(depPackagePath)) {
						const depPackage = JSON.parse(
							fs.readFileSync(depPackagePath, "utf8"),
						);
						this.resolvedPackageJson.dependencies[depName] =
							depPackage.version || "1.0.0";
						log(
							`  ✓ Resolved ${depName}: workspace:* → ${this.resolvedPackageJson.dependencies[depName]}`,
							"green",
						);
					}
				} else if (depVersion === "catalog:") {
					// For catalog dependencies, query pnpm for the resolved version
					const resolvedVersion = this.resolveVersionFromPnpm(depName);
					if (resolvedVersion) {
						this.resolvedPackageJson.dependencies[depName] = resolvedVersion;
						log(
							`  ✓ Resolved ${depName}: catalog: → ${resolvedVersion}`,
							"green",
						);
					}
				}
			}
		}

		// Resolve catalog:* devDependencies
		if (this.resolvedPackageJson.devDependencies) {
			for (const [depName, depVersion] of Object.entries(
				this.resolvedPackageJson.devDependencies,
			)) {
				if (depVersion === "catalog:") {
					const resolvedVersion = this.resolveVersionFromPnpm(depName);
					if (resolvedVersion) {
						this.resolvedPackageJson.devDependencies[depName] = resolvedVersion;
						log(
							`  ✓ Resolved ${depName}: catalog: → ${resolvedVersion}`,
							"green",
						);
					}
				}
			}
		}
	}

	async createBackup() {
		log("💾 Creating package.json backup...", "blue");
		fs.writeFileSync(
			this.backupPath,
			JSON.stringify(this.originalPackageJson, null, 2),
		);
	}

	async writeResolvedPackageJson() {
		log("📝 Writing resolved package.json...", "blue");
		const packageJsonPath = path.join(this.extensionRoot, "package.json");
		fs.writeFileSync(
			packageJsonPath,
			JSON.stringify(this.resolvedPackageJson, null, 2),
		);
	}

	async restoreOriginalPackageJson() {
		log("🔄 Restoring original package.json...", "blue");
		const packageJsonPath = path.join(this.extensionRoot, "package.json");
		fs.writeFileSync(
			packageJsonPath,
			JSON.stringify(this.originalPackageJson, null, 2),
		);

		// Clean up backup
		if (fs.existsSync(this.backupPath)) {
			fs.unlinkSync(this.backupPath);
		}
	}

	async ensureNativeModules() {
		log("🔧 Ensuring native modules are properly handled...", "blue");

		// For better-sqlite3, we need to ensure it's rebuilt for the target platform
		try {
			// Check if better-sqlite3 is installed
			const betterSqlite3Path = path.join(
				this.extensionRoot,
				"node_modules",
				"better-sqlite3",
			);
			if (fs.existsSync(betterSqlite3Path)) {
				log("  ✓ better-sqlite3 found in node_modules", "green");

				// Rebuild better-sqlite3 for the current Node.js version
				log(
					"  🔨 Rebuilding better-sqlite3 for current Node.js version...",
					"cyan",
				);
				try {
					execCommand("npm rebuild better-sqlite3 --build-from-source", {
						cwd: this.extensionRoot,
					});
					log("  ✓ better-sqlite3 rebuilt successfully", "green");
				} catch (rebuildError) {
					log(
						`  ⚠ Warning: Failed to rebuild better-sqlite3: ${rebuildError.message}`,
						"yellow",
					);
					// Continue anyway - vsce may handle it
				}

				// Extract VS Code engine version from package.json
				const packageJson = JSON.parse(
					fs.readFileSync(
						path.join(this.extensionRoot, "package.json"),
						"utf8",
					),
				);
				const vscodeVersion =
					packageJson.engines?.vscode?.replace("^", "") || "1.99.0";

				log(`  ℹ VS Code minimum version: ${vscodeVersion}`, "cyan");
				log("  ✓ Native module handling complete", "green");
			} else {
				log("  ℹ better-sqlite3 not found in node_modules", "yellow");
			}
		} catch (error) {
			log(`  ⚠ Warning: Native module handling: ${error.message}`, "yellow");
		}
	}

	async copyNativeModules() {
		log("📦 Copying native modules to dist/node_modules...", "blue");
		try {
			const distPath = path.join(this.extensionRoot, "dist");
			if (!fs.existsSync(distPath)) {
				fs.mkdirSync(distPath, { recursive: true });
			}

			// Copy external modules to dist/node_modules
			// These are marked as external in esbuild and needed at runtime
			const modulesToCopy = [
				// NOTE: sql.js is handled separately by esbuild.config.cjs
				// It copies only minimal WASM files to dist/sql.js to save ~20MB
				"better-sqlite3",
				"bindings",
				"prebuild-install",
				"file-uri-to-path", // dependency of bindings
			];

			const distNodeModulesPath = path.join(distPath, "node_modules");
			if (!fs.existsSync(distNodeModulesPath)) {
				fs.mkdirSync(distNodeModulesPath, { recursive: true });
			}

			for (const moduleName of modulesToCopy) {
				let modulePath = path.join(
					this.extensionRoot,
					"node_modules",
					moduleName,
				);

				// If not found locally, try workspace root (for pnpm structure)
				if (!fs.existsSync(modulePath)) {
					const workspaceRoot = path.join(this.extensionRoot, "../..");
					modulePath = path.join(workspaceRoot, "node_modules", moduleName);
				}

				if (!fs.existsSync(modulePath)) {
					log(
						`  ℹ ${moduleName} not found in node_modules, skipping`,
						"yellow",
					);
					continue;
				}

				// Copy using cp -RL to follow symlinks and copy actual files
				execCommand(`cp -RL "${modulePath}" "${distNodeModulesPath}/"`);
				log(`  ✓ ${moduleName} copied to dist/node_modules`, "green");
			}

			log("  ✓ Native module dependencies copied", "green");
		} catch (error) {
			log(
				`  ⚠ Warning: Failed to copy native modules: ${error.message}`,
				"yellow",
			);
			// Don't throw - vsce may still handle it
		}
	}

	async cleanOldVSIXFiles() {
		log("🧹 Cleaning old VSIX files...", "blue");
		try {
			const vsixFiles = fs
				.readdirSync(this.extensionRoot)
				.filter((file) => file.endsWith(".vsix"));

			if (vsixFiles.length === 0) {
				log("  ℹ No old VSIX files found", "cyan");
				return;
			}

			for (const file of vsixFiles) {
				const filePath = path.join(this.extensionRoot, file);
				fs.unlinkSync(filePath);
				log(`  ✓ Deleted: ${file}`, "green");
			}

			log(`  ✓ Cleaned ${vsixFiles.length} old VSIX file(s)`, "green");
		} catch (error) {
			log(
				`  ⚠ Warning: Failed to clean old VSIX files: ${error.message}`,
				"yellow",
			);
			// Don't throw - this is not critical
		}
	}

	async package() {
		try {
			log("🚀 Starting VSIX packaging process...", "green");

			// Clean old VSIX files first
			await this.cleanOldVSIXFiles();

			// Resolve dependencies and create backup
			await this.resolveWorkspaceDependencies();
			await this.createBackup();
			await this.writeResolvedPackageJson();

			const nodeModulesPath = path.join(this.extensionRoot, "node_modules");
			if (!fs.existsSync(nodeModulesPath)) {
				throw new Error(
					"Extension dependencies missing. Please run `pnpm install --filter ./apps/vscode --ignore-scripts` from the repo root before packaging.",
				);
			}
			await this.ensureNativeModules();
			await this.copyNativeModules();

			// Package with vsce
			log("📦 Running vsce package...", "blue");
			// Use --no-dependencies to skip npm/yarn validation which fails in pnpm monorepos
			// The .vscodeignore !dist/node_modules/ line ensures native modules are packaged
			// --baseContentUrl provides a base URL for README links since we're in a monorepo

			execCommand(
				"npx vsce package --no-dependencies --baseContentUrl https://github.com/Marcelle-Labs/SnapBack/tree/main/apps/vscode",
			);

			log("✅ VSIX packaging completed successfully!", "green");
		} catch (error) {
			log(`❌ Packaging failed: ${error.message}`, "red");
			throw error;
		} finally {
			// Always restore original package.json
			await this.restoreOriginalPackageJson();
		}
	}
}

// Main execution
async function main() {
	const packager = new VSIXPackager();
	await packager.package();
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

module.exports = { VSIXPackager };
