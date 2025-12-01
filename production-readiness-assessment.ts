#!/usr/bin/env tsx

/**
 * SnapBack Production Readiness Assessment
 *
 * This script performs a basic assessment of the SnapBack VS Code extension
 * to determine its production readiness.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "@snapback/infrastructure";

interface AssessmentResult {
	score: number;
	maxScore: number;
	sections: {
		name: string;
		score: number;
		maxScore: number;
		checks: {
			name: string;
			passed: boolean;
			notes?: string;
		}[];
	}[];
}

async function checkFileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function checkBuildCompletes(): Promise<boolean> {
	try {
		const { exec } = await import("node:child_process");
		return new Promise((resolve) => {
			exec("pnpm run compile", { cwd: process.cwd() }, (error) => {
				resolve(!error);
			});
		});
	} catch {
		return false;
	}
}

async function checkPackageCreation(): Promise<boolean> {
	try {
		const { exec } = await import("node:child_process");
		return new Promise((resolve) => {
			exec("pnpm run package-vsix", { cwd: process.cwd() }, (error) => {
				resolve(!error);
			});
		});
	} catch {
		return false;
	}
}

async function checkCoreServices(): Promise<boolean> {
	const coreServices = [
		"src/services/protectedFileRegistry.ts",
		"src/services/SnapshotService.ts",
		"src/storage/SqliteSnapshotStorage.ts",
		"src/snapshot/SnapshotManager.ts",
	];

	for (const service of coreServices) {
		if (!(await checkFileExists(path.join(process.cwd(), service)))) {
			return false;
		}
	}
	return true;
}

async function checkExtensionManifest(): Promise<boolean> {
	try {
		const packageJsonPath = path.join(process.cwd(), "package.json");
		const packageJson = JSON.parse(
			await fs.promises.readFile(packageJsonPath, "utf-8"),
		);

		// Check required fields
		const requiredFields = [
			"name",
			"displayName",
			"description",
			"version",
			"publisher",
			"engines",
			"main",
			"contributes",
		];

		for (const field of requiredFields) {
			if (!packageJson[field]) {
				return false;
			}
		}

		// Check activation events
		if (
			!Array.isArray(packageJson.activationEvents) ||
			packageJson.activationEvents.length === 0
		) {
			return false;
		}

		// Check contributes.commands
		if (
			!packageJson.contributes?.commands ||
			!Array.isArray(packageJson.contributes.commands)
		) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

async function checkDocumentation(): Promise<boolean> {
	const requiredDocs = ["README.md", "CHANGELOG.md", "LICENSE"];

	for (const doc of requiredDocs) {
		if (!(await checkFileExists(path.join(process.cwd(), doc)))) {
			return false;
		}
	}
	return true;
}

async function checkMediaAssets(): Promise<boolean> {
	const mediaDir = path.join(process.cwd(), "media");
	if (!(await checkFileExists(mediaDir))) {
		return false;
	}

	try {
		const files = await fs.promises.readdir(mediaDir);
		return files.length > 0;
	} catch {
		return false;
	}
}

async function runAssessment(): Promise<AssessmentResult> {
	const result: AssessmentResult = {
		score: 0,
		maxScore: 0,
		sections: [],
	};

	// Section 1: Code Quality & Completeness
	const codeQualitySection = {
		name: "Code Quality & Completeness",
		score: 0,
		maxScore: 20,
		checks: [
			{
				name: "TypeScript Compilation Clean",
				passed: await checkBuildCompletes(),
				notes: "Extension compiles without TypeScript errors",
			},
			{
				name: "Core Services Present",
				passed: await checkCoreServices(),
				notes: "All critical services exist",
			},
			{
				name: "Extension Manifest Valid",
				passed: await checkExtensionManifest(),
				notes: "package.json has all required fields",
			},
		],
	};

	codeQualitySection.score =
		codeQualitySection.checks.filter((c) => c.passed).length *
		(20 / codeQualitySection.checks.length);
	result.sections.push(codeQualitySection);

	// Section 2: Feature Functionality
	const featureSection = {
		name: "Feature Functionality",
		score: 0,
		maxScore: 25,
		checks: [
			{
				name: "VSIX Package Creation",
				passed: await checkPackageCreation(),
				notes: "Can create installable VSIX package",
			},
			{
				name: "Protection System Implementation",
				passed: await checkFileExists(
					path.join(process.cwd(), "src/services/protectedFileRegistry.ts"),
				),
				notes: "ProtectedFileRegistry service exists",
			},
			{
				name: "Snapshot System Implementation",
				passed: await checkFileExists(
					path.join(process.cwd(), "src/snapshot/SnapshotManager.ts"),
				),
				notes: "SnapshotManager service exists",
			},
		],
	};

	featureSection.score =
		featureSection.checks.filter((c) => c.passed).length *
		(25 / featureSection.checks.length);
	result.sections.push(featureSection);

	// Section 3: Documentation & Assets
	const docsSection = {
		name: "Documentation & Assets",
		score: 0,
		maxScore: 15,
		checks: [
			{
				name: "Required Documentation",
				passed: await checkDocumentation(),
				notes: "README.md, CHANGELOG.md, and LICENSE exist",
			},
			{
				name: "Media Assets",
				passed: await checkMediaAssets(),
				notes: "Media directory with assets exists",
			},
		],
	};

	docsSection.score =
		docsSection.checks.filter((c) => c.passed).length *
		(15 / docsSection.checks.length);
	result.sections.push(docsSection);

	// Calculate total score
	result.score = result.sections.reduce(
		(sum, section) => sum + section.score,
		0,
	);
	result.maxScore = result.sections.reduce(
		(sum, section) => sum + section.maxScore,
		0,
	);

	return result;
}

function printAssessmentResult(result: AssessmentResult): void {
	logger.info(".snapback-production-readiness-assessment.md");
	console.log("=".repeat(50));
	console.log();
	logger.info("# SnapBack VS Code Extension - Production Readiness Assessment");
	console.log();
	logger.info("## 🎯 Assessment Results");
	console.log();
	console.log(
		`**Overall Score: ${Math.round(result.score)}/${
			result.maxScore
		} (${Math.round((result.score / result.maxScore) * 100)}%)**`,
	);
	console.log();

	// Readiness level
	const percentage = (result.score / result.maxScore) * 100;
	if (percentage >= 95) {
		logger.info("🟢 **PRODUCTION READY** - Very High Confidence");
	} else if (percentage >= 90) {
		logger.info("🟡 **ALMOST READY** - High Confidence");
	} else if (percentage >= 80) {
		logger.info("🟠 **NEEDS WORK** - Medium Confidence");
	} else {
		logger.info("🔴 **NOT READY** - Low Confidence");
	}
	console.log();

	// Section details
	for (const section of result.sections) {
		console.log(
			`## ${section.name} (${Math.round(section.score)}/${section.maxScore})`,
		);
		for (const check of section.checks) {
			logger.info(`  ${check.passed ? "✅" : "❌"} ${check.name}`);
			if (check.notes) {
				logger.info(`    ${check.notes}`);
			}
		}
		console.log();
	}

	// Recommendations
	logger.info("## 📝 Recommendations");
	if (percentage >= 95) {
		logger.info("1. Review documentation one final time");
		logger.info("2. Create release notes");
		logger.info("3. Publish to marketplace");
		logger.info("4. Announce launch");
	} else if (percentage >= 90) {
		logger.info("1. Fix any failing checks");
		logger.info("2. Rerun assessment");
		logger.info("3. Update documentation");
		logger.info("4. Publish when ≥ 95%");
	} else if (percentage >= 80) {
		logger.info("1. Prioritize failures by impact");
		logger.info("2. Focus on user-facing issues first");
		logger.info("3. Address security/data safety issues");
		logger.info("4. Rerun full assessment when fixed");
	} else {
		logger.info("1. Return to development phase");
		logger.info("2. Complete missing features");
		logger.info("3. Fix critical bugs");
		logger.info("4. Increase test coverage");
	}
}

// Run the assessment
runAssessment().then(printAssessmentResult).catch(console.error);
