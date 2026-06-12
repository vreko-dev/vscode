import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

describe("Extension Commands Manifest", () => {
	it("should register all commands declared in package.json", () => {
		const pkgPath = path.join(__dirname, "../../package.json");
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
		const contributedCommands: string[] = pkg.contributes.commands.map((c: any) => c.command);

		const srcDir = path.join(__dirname, "../../src");
		const registeredCommands = new Set<string>();

		function traverse(dir: string) {
			if (!fs.existsSync(dir)) return;
			const files = fs.readdirSync(dir);
			for (const file of files) {
				const fullPath = path.join(dir, file);
				if (fs.statSync(fullPath).isDirectory()) {
					traverse(fullPath);
				} else if (fullPath.endsWith(".ts")) {
					const content = fs.readFileSync(fullPath, "utf8");
					// Match registerCommand("...") or registerCommandSafely("...")
					// We match standard patterns:
					const regex = /registerCommand[^'"\`]*['"\`]([^'"\`]+)['"\`]/g;
					const matches = Array.from(content.matchAll(regex));
					matches.forEach(m => registeredCommands.add(m[1]));
				}
			}
		}

		traverse(srcDir);

		const deadCommands = contributedCommands.filter((cmd) => !registeredCommands.has(cmd));

		// And also check that everything registered is contributed (some commands might be internal only, but usually they are all in package.json)
		// Wait, some commands might legitimately be internal-only and not in package.json.
		// If so, we can just log a warning or filter out commands starting with internal.

		expect(deadCommands).toEqual([]);
	});
});



