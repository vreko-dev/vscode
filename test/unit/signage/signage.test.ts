import { describe, expect, it } from "vitest";
import {
	BRAND_SIGNAGE,
	CORE_CONCEPT_SIGNAGE,
	canonicalProtectionLevelToLegacy,
	FILE_HEALTH_DECORATIONS,
	getFileHealthDecoration,
	getProtectionLevelSignage,
	getRepoStatusSignage,
	legacyProtectionLevelToCanonical,
	PROTECTION_LEVEL_SIGNAGE,
	REPO_STATUS_SIGNAGE,
} from "@vscode/signage/index";
import {
	FILE_HEALTH_CANONICAL,
	type FileHealthCanonical,
	PROTECTION_LEVEL_CANONICAL,
	type ProtectionLevelCanonical,
	REPO_STATUS_CANONICAL,
	type RepoStatusCanonical,
} from "@vscode/signage/types";

describe("Signage Module", () => {
	describe("Protection Level Canonical Values", () => {
		it("should define three protection levels", () => {
			expect(Object.keys(PROTECTION_LEVEL_CANONICAL)).toHaveLength(3);
			expect(PROTECTION_LEVEL_CANONICAL.WATCH).toBe("watch");
			expect(PROTECTION_LEVEL_CANONICAL.WARN).toBe("warn");
			expect(PROTECTION_LEVEL_CANONICAL.BLOCK).toBe("block");
		});

		it("should have signage for each protection level", () => {
			const levels: ProtectionLevelCanonical[] = ["watch", "warn", "block"];
			levels.forEach((level) => {
				expect(PROTECTION_LEVEL_SIGNAGE[level]).toBeDefined();
				expect(PROTECTION_LEVEL_SIGNAGE[level].label).toBeTruthy();
				expect(PROTECTION_LEVEL_SIGNAGE[level].emoji).toBeTruthy();
				expect(PROTECTION_LEVEL_SIGNAGE[level].color).toBeTruthy();
			});
		});

		it("should have consistent emoji across signage", () => {
			expect(PROTECTION_LEVEL_SIGNAGE.watch.emoji).toBe("🟢");
			expect(PROTECTION_LEVEL_SIGNAGE.warn.emoji).toBe("🟡");
			expect(PROTECTION_LEVEL_SIGNAGE.block.emoji).toBe("🔴");
		});

		it("should have consistent labels", () => {
			expect(PROTECTION_LEVEL_SIGNAGE.watch.label).toBe("Watch");
			expect(PROTECTION_LEVEL_SIGNAGE.warn.label).toBe("Warn");
			expect(PROTECTION_LEVEL_SIGNAGE.block.label).toBe("Block");
		});
	});

	describe("Repo Status Canonical Values", () => {
		it("should define four repo statuses", () => {
			expect(Object.keys(REPO_STATUS_CANONICAL)).toHaveLength(4);
			expect(REPO_STATUS_CANONICAL.UNPROTECTED).toBe("unprotected");
			expect(REPO_STATUS_CANONICAL.PARTIAL).toBe("partial");
			expect(REPO_STATUS_CANONICAL.PROTECTED).toBe("protected");
			expect(REPO_STATUS_CANONICAL.ERROR).toBe("error");
		});

		it("should have signage for each repo status", () => {
			const statuses: RepoStatusCanonical[] = [
				"unprotected",
				"partial",
				"protected",
				"error",
			];
			statuses.forEach((status) => {
				expect(REPO_STATUS_SIGNAGE[status]).toBeDefined();
				expect(REPO_STATUS_SIGNAGE[status].label).toBeTruthy();
				expect(REPO_STATUS_SIGNAGE[status].emoji).toBeTruthy();
			});
		});

		it("should map repo statuses correctly", () => {
			expect(REPO_STATUS_SIGNAGE.unprotected.emoji).toBe("⭕");
			expect(REPO_STATUS_SIGNAGE.partial.emoji).toBe("🟡");
			expect(REPO_STATUS_SIGNAGE.protected.emoji).toBe("🟢");
			expect(REPO_STATUS_SIGNAGE.error.emoji).toBe("⚠️");
		});
	});

	describe("File Health Canonical Values", () => {
		it("should define three file health states", () => {
			expect(Object.keys(FILE_HEALTH_CANONICAL)).toHaveLength(3);
			expect(FILE_HEALTH_CANONICAL.PROTECTED).toBe("protected");
			expect(FILE_HEALTH_CANONICAL.WARNING).toBe("warning");
			expect(FILE_HEALTH_CANONICAL.RISK).toBe("risk");
		});

		it("should have decorations for each file health state", () => {
			const states: FileHealthCanonical[] = ["protected", "warning", "risk"];
			states.forEach((state) => {
				expect(FILE_HEALTH_DECORATIONS[state]).toBeDefined();
				expect(FILE_HEALTH_DECORATIONS[state].badge).toBeTruthy();
				expect(FILE_HEALTH_DECORATIONS[state].tooltip).toBeTruthy();
			});
		});

		it("should have distinct badges for file health", () => {
			expect(FILE_HEALTH_DECORATIONS.protected.badge).toBe("🛡️");
			expect(FILE_HEALTH_DECORATIONS.warning.badge).toBe("⚠️");
			expect(FILE_HEALTH_DECORATIONS.risk.badge).toBe("🚨");
		});
	});

	describe("Brand Signage", () => {
		it("should define brand emoji and labels", () => {
			expect(BRAND_SIGNAGE.logoEmoji).toBe("🧢");
			expect(BRAND_SIGNAGE.shortLabel).toBe("SnapBack");
			expect(BRAND_SIGNAGE.fullLabel).toBe("SnapBack Protection");
		});
	});

	describe("Core Concept Signage", () => {
		it("should define all core concepts", () => {
			expect(CORE_CONCEPT_SIGNAGE.snapshot).toBeDefined();
			expect(CORE_CONCEPT_SIGNAGE.session).toBeDefined();
			expect(CORE_CONCEPT_SIGNAGE.protectedFiles).toBeDefined();
			expect(CORE_CONCEPT_SIGNAGE.blockingIssues).toBeDefined();
			expect(CORE_CONCEPT_SIGNAGE.watchItems).toBeDefined();
		});

		it("should have labels and emoji for each concept", () => {
			const concepts = Object.values(CORE_CONCEPT_SIGNAGE);
			concepts.forEach((concept) => {
				expect(concept.label).toBeTruthy();
				expect(concept.emoji).toBeTruthy();
			});
		});

		it("should map concepts correctly", () => {
			expect(CORE_CONCEPT_SIGNAGE.snapshot.emoji).toBe("📸");
			expect(CORE_CONCEPT_SIGNAGE.session.emoji).toBe("🕐");
			expect(CORE_CONCEPT_SIGNAGE.protectedFiles.emoji).toBe("🛡️");
			expect(CORE_CONCEPT_SIGNAGE.blockingIssues.emoji).toBe("⚠️");
			expect(CORE_CONCEPT_SIGNAGE.watchItems.emoji).toBe("📊");
		});
	});

	describe("Legacy to Canonical Mapping", () => {
		it("should map legacy Watched to watch", () => {
			expect(legacyProtectionLevelToCanonical("Watched")).toBe("watch");
		});

		it("should map legacy Warning to warn", () => {
			expect(legacyProtectionLevelToCanonical("Warning")).toBe("warn");
		});

		it("should map legacy Protected to block", () => {
			expect(legacyProtectionLevelToCanonical("Protected")).toBe("block");
		});

		it("should map canonical watch back to Watched", () => {
			expect(canonicalProtectionLevelToLegacy("watch")).toBe("Watched");
		});

		it("should map canonical warn back to Warning", () => {
			expect(canonicalProtectionLevelToLegacy("warn")).toBe("Warning");
		});

		it("should map canonical block back to Protected", () => {
			expect(canonicalProtectionLevelToLegacy("block")).toBe("Protected");
		});
	});

	describe("Convenience Helpers", () => {
		it("should get protection level signage by level", () => {
			const signage = getProtectionLevelSignage("watch");
			expect(signage.label).toBe("Watch");
			expect(signage.emoji).toBe("🟢");
		});

		it("should get repo status signage by status", () => {
			const signage = getRepoStatusSignage("protected");
			expect(signage.label).toBe("Protected");
			expect(signage.emoji).toBe("🟢");
		});

		it("should get file health decoration by state", () => {
			const decoration = getFileHealthDecoration("risk");
			expect(decoration.badge).toBe("🚨");
			expect(decoration.tooltip).toBeTruthy();
		});
	});

	describe("Consistency Checks", () => {
		it("should not have duplicate emoji across protection levels", () => {
			const emojis = [
				PROTECTION_LEVEL_SIGNAGE.watch.emoji,
				PROTECTION_LEVEL_SIGNAGE.warn.emoji,
				PROTECTION_LEVEL_SIGNAGE.block.emoji,
			];
			const uniqueEmojis = new Set(emojis);
			expect(uniqueEmojis.size).toBe(3);
		});

		it("should not have duplicate labels across protection levels", () => {
			const labels = [
				PROTECTION_LEVEL_SIGNAGE.watch.label,
				PROTECTION_LEVEL_SIGNAGE.warn.label,
				PROTECTION_LEVEL_SIGNAGE.block.label,
			];
			const uniqueLabels = new Set(labels);
			expect(uniqueLabels.size).toBe(3);
		});

		it("should not have duplicate emoji across file health states", () => {
			const badges = [
				FILE_HEALTH_DECORATIONS.protected.badge,
				FILE_HEALTH_DECORATIONS.warning.badge,
				FILE_HEALTH_DECORATIONS.risk.badge,
			];
			const uniqueBadges = new Set(badges);
			expect(uniqueBadges.size).toBe(3);
		});

		it("should have theme colors for all elements that need them", () => {
			[
				PROTECTION_LEVEL_SIGNAGE.watch,
				PROTECTION_LEVEL_SIGNAGE.warn,
				PROTECTION_LEVEL_SIGNAGE.block,
			].forEach((signage) => {
				expect(signage.themeColor).toBeTruthy();
			});
		});
	});
});
