/**
 * Assumption 3: Babel Error Recovery
 *
 * Test: Can Babel parse broken TypeScript and still extract symbols?
 *
 * Success: Extracts symbols from both valid and broken code
 * Failure: Crashes on broken code or extracts nothing
 */

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import type { SpikeResult } from "../utils";

const BROKEN_CODE_SAMPLES = [
	// Partial object (cursor mid-typing)
	`const user = {
    profile: {
      settings: {
        notifications: {
          email: {`,

	// Unclosed function
	`export function processData(items: string[]) {
    return items.map(item => {
      if (item.length > 0) {`,

	// Mixed valid and broken
	`import { useState } from 'react';

  export const Component = () => {
    const [state, setState] = useState(
    // cursor here, incomplete
  `,

	// Valid code (control)
	`export interface User {
    id: string;
    name: string;
  }

  export function getUser(id: string): User {
    return { id, name: 'Test' };
  }`,
];

export async function runBabelRecovery(): Promise<SpikeResult> {
	const name = "babel-recovery";
	const description = "Babel errorRecovery parses broken TypeScript";

	const results: { code: string; symbols: string[]; hadError: boolean }[] = [];

	for (const code of BROKEN_CODE_SAMPLES) {
		try {
			const ast = parser.parse(code, {
				sourceType: "module",
				plugins: ["typescript", "jsx"],
				errorRecovery: true, // Critical flag
			});

			const symbols: string[] = [];

			traverse(ast, {
				FunctionDeclaration(path) {
					if (path.node.id) symbols.push(`fn:${path.node.id.name}`);
				},
				VariableDeclarator(path) {
					if (path.node.id.type === "Identifier") {
						symbols.push(`var:${path.node.id.name}`);
					}
				},
				TSInterfaceDeclaration(path) {
					symbols.push(`interface:${path.node.id.name}`);
				},
				ExportNamedDeclaration(path) {
					if (path.node.declaration) {
						symbols.push("export:named");
					}
				},
			});

			results.push({
				code: `${code.slice(0, 50)}...`,
				symbols,
				hadError: !!(ast.errors && ast.errors.length > 0),
			});
		} catch (_error) {
			// Even with errorRecovery, catastrophic failures can happen
			// This is where lexical fallback would activate
			results.push({
				code: `${code.slice(0, 50)}...`,
				symbols: [],
				hadError: true,
			});
		}
	}

	const totalSymbols = results.reduce((acc, r) => acc + r.symbols.length, 0);
	const successRate =
		results.filter((r) => r.symbols.length > 0).length / results.length;

	// Note: Even if success rate is low, this validates the need for lexical fallback
	// rather than invalidating the architecture
	if (successRate < 0.25) {
		return {
			name,
			description,
			status: "FAIL",
			critical: false, // Not critical - just means we need fallback
			message: `Only ${(successRate * 100).toFixed(0)}% of samples produced symbols - lexical fallback required`,
			metrics: { successRate, totalSymbols, results },
		};
	}

	if (successRate < 0.75) {
		return {
			name,
			description,
			status: "WARN",
			critical: false,
			message: `${(successRate * 100).toFixed(0)}% success - lexical fallback recommended`,
			metrics: { successRate, totalSymbols, results },
		};
	}

	return {
		name,
		description,
		status: "PASS",
		critical: false,
		message: `${(successRate * 100).toFixed(0)}% success, ${totalSymbols} symbols extracted`,
		metrics: { successRate, totalSymbols, results },
	};
}
