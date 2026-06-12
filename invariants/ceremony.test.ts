import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

describe("Ceremony Invariants", () => {
	// -------------------------------------------------------------------------
	// CEREM-01: Session end always triggers ceremony  -  structural stub
	// -------------------------------------------------------------------------

	describe("CEREM-01: session end always triggers ceremony  -  structural stub", () => {
		it("SignalCoordinator.ts calls showClosingCeremony on session end", () => {
			const content = fs.readFileSync(
				path.join(
					__dirname,
					"../../src/signals/SignalCoordinator.ts",
				),
				"utf8",
			);
			expect(content).toMatch(/showClosingCeremony/);
		});
	});

	// -------------------------------------------------------------------------
	// CEREM-04: Ceremony visible in VS Code extension
	// -------------------------------------------------------------------------

	describe("CEREM-04: ceremony visible in VS Code extension", () => {
		it("ClosingCeremonyUI.ts exports showClosingCeremony function", () => {
			const content = fs.readFileSync(
				path.join(
					__dirname,
					"../../src/ui/ClosingCeremonyUI.ts",
				),
				"utf8",
			);
			expect(content).toMatch(/export.*showClosingCeremony/);
		});

		it.todo(
			"extension.ts wires onSessionEnded event to ceremony reveal path",
		);
	});

	// -------------------------------------------------------------------------
	// CEREM-05: Copy-to-clipboard available in extension surface
	// -------------------------------------------------------------------------

	describe("CEREM-05: copy-to-clipboard available in extension surface", () => {
		it("ClosingCeremonyUI.ts references vscode.env.clipboard", () => {
			const content = fs.readFileSync(
				path.join(
					__dirname,
					"../../src/ui/ClosingCeremonyUI.ts",
				),
				"utf8",
			);
			expect(content).toMatch(/clipboard/);
		});

		it.todo(
			"CeremonyWebViewProvider Copy Summary button calls vscode.env.clipboard.writeText with canonical markdown",
		);
	});

	// -------------------------------------------------------------------------
	// CEREM-02: Ceremony output under 80 chars  -  stub (RED until CLI ceremony ships)
	// -------------------------------------------------------------------------

	describe("CEREM-02: ceremony output under 80 chars  -  stub (RED until CLI ceremony ships)", () => {
		it.todo("renderCeremony() every output line is ≤ 80 chars wide");
		it.todo(
			"renderCeremony() output contains valid markdown table with '## Vreko Session Summary' heading",
		);
	});
});
