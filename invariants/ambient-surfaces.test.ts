import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// VSUI-01: No MCP calls in ambient UI surface files
// ---------------------------------------------------------------------------

describe("VSUI-01: no MCP calls in ambient UI surface files", () => {
	it("ActivityLog.ts contains no MCP tool calls", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/ActivityLog.ts"),
			"utf8",
		);
		expect(content).not.toMatch(
			/mcpClient|callTool|mcp\.call|vreko_begin|vreko_end/,
		);
	});

	it("VitalsUIIntegration.ts contains no MCP tool calls", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/VitalsUIIntegration.ts"),
			"utf8",
		);
		expect(content).not.toMatch(
			/mcpClient|callTool|mcp\.call|vreko_begin|vreko_end/,
		);
	});
});

// ---------------------------------------------------------------------------
// VSUI-02: Zero runtime @snapback/intelligence imports in extension source
// ---------------------------------------------------------------------------

describe("VSUI-02: zero runtime @snapback/intelligence imports in extension source", () => {
	it("extension source has zero runtime @snapback/intelligence imports", () => {
		const srcDir = path.join(__dirname, "../../src");
		let count = 0;

		function traverse(dir: string) {
			if (!fs.existsSync(dir)) return;
			for (const file of fs.readdirSync(dir)) {
				const full = path.join(dir, file);
				if (fs.statSync(full).isDirectory()) {
					traverse(full);
					continue;
				}
				if (!full.endsWith(".ts")) continue;
				const lines = fs.readFileSync(full, "utf8").split("\n");
				for (const line of lines) {
					if (
						/^import/.test(line) &&
						/@snapback\/(intelligence|engine|platform)/.test(line)
					) {
						count++;
					}
				}
			}
		}

		traverse(srcDir);
		expect(count).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// VSUI-04: Ambient surfaces perform no synchronous I/O
// ---------------------------------------------------------------------------

describe("VSUI-04: ambient surfaces perform no synchronous I/O", () => {
	const surfaceFiles = [
		"../../src/ui/ActivityLog.ts",
		"../../src/ui/VitalsUIIntegration.ts",
	];

	for (const rel of surfaceFiles) {
		it(`${rel.split("/").pop()} does not import 'fs' or 'node:fs'`, () => {
			const content = fs.readFileSync(path.join(__dirname, rel), "utf8");
			expect(content).not.toMatch(
				/^import.*['"]fs['"]|^import.*['"]node:fs['"]/m,
			);
		});
	}
});

// ---------------------------------------------------------------------------
// VSUI-03, VSUI-05, VSUI-06, VSUI-07, VSUI-08, VSUI-09  -  todo stubs (RED)
// ---------------------------------------------------------------------------

describe("VSUI-03: surface renders within 250ms  -  stub (RED)", () => {
	it.todo(
		"all ambient surface handlers complete synchronous portion in under 250ms after daemon event",
	);
});

describe("VSUI-05: pulse status bar tooltip  -  stub (RED)", () => {
	it.todo(
		"VitalsUIIntegration.handleSessionHealthUpdate sets tooltip from vitals RPC data",
	);
});

describe("VSUI-06: activity log real-time events  -  stub (RED)", () => {
	it.todo(
		"ActivityLog.log is called for all observation kinds: snapshot.created, learning.added, risk.updated",
	);
});

describe("VSUI-07: ceremony reveal panel on session end  -  stub (RED)", () => {
	it.todo(
		"extension.ts wires onSessionEnded to CeremonyWebViewProvider.show() behind ceremonyAutoOpen config gate",
	);
});

describe("VSUI-08: gutter decorations  -  FragilityGutterDecorationProvider structural checks", () => {
	it("FragilityGutterDecorationProvider.ts exists and exports FragilityGutterDecorationProvider", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/FragilityGutterDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/export class FragilityGutterDecorationProvider/);
	});

	it("FragilityGutterDecorationProvider.ts uses createTextEditorDecorationType (not FileDecorationProvider)", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/FragilityGutterDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/createTextEditorDecorationType/);
	});

	it("FragilityGutterDecorationProvider.ts disposes both TextEditorDecorationTypes", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/FragilityGutterDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/highDecoration\.dispose\(\)/);
		expect(content).toMatch(/moderateDecoration\.dispose\(\)/);
	});

	it("FragilityGutterDecorationProvider.ts contains no hex color literals", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/FragilityGutterDecorationProvider.ts"),
			"utf8",
		);
		expect(content).not.toMatch(/#[0-9A-Fa-f]{6}/);
	});

	it("extension.ts wires FragilityGutterDecorationProvider in AMBIENT-07 setImmediate zone", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/extension.ts"),
			"utf8",
		);
		expect(content).toMatch(/FragilityGutterDecorationProvider/);
	});
});

describe("VSUI-09: intelligence badge on affected files  -  live wiring verified", () => {
	it("VrekoDecorationProvider.ts contains agentTouchedFiles badge with charts.blue color", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/VrekoDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/agentTouchedFiles/);
		expect(content).toMatch(/charts\.blue/);
		expect(content).not.toMatch(/#[0-9A-Fa-f]{6}/); // no hex literals
	});

	it("VrekoDecorationProvider.ts wires onMcpFileModified to live daemon events (no stubs)", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/VrekoDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/onMcpFileModified/);
		expect(content).toMatch(/agentTouchedFiles\.set/);
	});

	it("VrekoDecorationProvider.ts uses ThemeColor API only  -  charts.yellow for fragile, charts.blue for agent-touched", () => {
		const content = fs.readFileSync(
			path.join(__dirname, "../../src/ui/decorations/VrekoDecorationProvider.ts"),
			"utf8",
		);
		expect(content).toMatch(/charts\.yellow/);
		expect(content).toMatch(/charts\.blue/);
	});
});
