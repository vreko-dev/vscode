import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SemanticCheckpointNamer } from "../../src/semanticCheckpointNamer.js";

describe("SemanticCheckpointNamer", () => {
	let namer: SemanticCheckpointNamer;

	beforeEach(() => {
		namer = new SemanticCheckpointNamer();
	});

	afterEach(() => {
		// Clean up if needed
	});

	describe("generateName", () => {
		it("should generate name for dependency changes", () => {
			const diff = `
diff --git a/package.json b/package.json
index 1234567..8901234 100644
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
   "dependencies": {
-    "react": "^17.0.0",
+    "react": "^18.0.0",
-    "lodash": "^4.17.20"
+    "lodash": "^4.17.21"
   }
`;
			const files = ["package.json"];
			const name = namer.generateName(diff, files);
			expect(name).toMatch(
				/updated-(react|lodash|\d+-packages|dependency-update)/,
			);
		});

		it("should generate name for config changes", () => {
			const diff = `
diff --git a/tsconfig.json b/tsconfig.json
index 1234567..8901234 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -5,6 +5,7 @@
   "compilerOptions": {
     "target": "es2020",
+    "strict": true,
     "module": "commonjs"
   }
`;
			const files = ["tsconfig.json"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("typescript-config-update");
		});

		it("should generate name for migration changes", () => {
			const diff = `
diff --git a/src/index.js b/src/index.js
deleted file mode 100644
index 1234567..0000000
--- a/src/index.js
+++ /dev/null
@@ -1,5 +0,0 @@
-const express = require('express');
-const app = express();
-app.get('/', (req, res) => res.send('Hello World!'));
-app.listen(3000);
-console.log('Server running on port 3000');
diff --git a/src/index.ts b/src/index.ts
new file mode 100644
index 0000000..8901234
--- /dev/null
+++ b/src/index.ts
@@ -0,0 +1,5 @@
+import express from 'express';
+const app = express();
+app.get('/', (req, res) => res.send('Hello World!'));
+app.listen(3000);
+console.log('Server running on port 3000');
`;
			const files = ["src/index.js", "src/index.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("code-migration");
		});

		it("should generate name for feature additions", () => {
			const diff = `
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/components/Button.tsx
@@ -0,0 +1,10 @@
+import React from 'react';
+
+interface ButtonProps {
+  text: string;
+  onClick: () => void;
+}
+
+const Button: React.FC<ButtonProps> = ({ text, onClick }) => {
+  return <button onClick={onClick}>{text}</button>;
+};
+
+export default Button;
`;
			const files = [
				"src/components/Button.tsx",
				"src/components/Input.tsx",
				"src/components/Card.tsx",
				"src/components/Modal.tsx",
			];
			const name = namer.generateName(diff, files);
			expect(name).toBe("added-Button");
		});

		it("should generate name for bug fixes", () => {
			const diff = `
diff --git a/src/utils/calculate.ts b/src/utils/calculate.ts
index 1234567..8901234 100644
--- a/src/utils/calculate.ts
+++ b/src/utils/calculate.ts
@@ -5,7 +5,7 @@
 // BUG: Division by zero was causing crashes
-export function divide(a: number, b: number): number {
-  return a / b;
+export function divide(a: number, b: number): number {
+  if (b === 0) return 0;
+  return a / b;
 }
`;
			const files = ["src/utils/calculate.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toMatch(/fixed-(division-by-zero|calculate)/);
		});

		it("should generate name for build setup changes", () => {
			const diff = `
diff --git a/webpack.config.js b/webpack.config.js
index 1234567..8901234 100644
--- a/webpack.config.js
+++ b/webpack.config.js
@@ -10,6 +10,7 @@
   module: {
     rules: [
       {
+        test: /.tsx?$/,
+        use: 'ts-loader',
+        exclude: /node_modules/,
       }
     ]
   }
`;
			const files = ["webpack.config.js"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("build-setup-webpack");
		});

		it("should generate name for refactoring", () => {
			const diff = `
diff --git a/src/auth/service.ts b/src/auth/service.ts
index 1234567..8901234 100644
--- a/src/auth/service.ts
+++ b/src/auth/service.ts
@@ -1,10 +1,15 @@
-class AuthService {
+class AuthenticationService {
   private users: Map<string, User> = new Map();
   
-  authenticate(username: string, password: string): boolean {
+  authenticateUser(username: string, password: string): boolean {
     // Implementation
   }
   
+  validateToken(token: string): boolean {
+    // Implementation
+  }
 }
`;
			const files = ["src/auth/service.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("class-restructure");
		});

		it("should generate name for advanced refactoring", () => {
			const diff = `
diff --git a/src/patterns/observer.ts b/src/patterns/observer.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/patterns/observer.ts
@@ -0,0 +1,20 @@
+// Implementation of Observer design pattern
+interface Observer {
+  update(data: any): void;
+}
+
+interface Subject {
+  addObserver(observer: Observer): void;
+  removeObserver(observer: Observer): void;
+  notifyObservers(data: any): void;
+}
+
+class ConcreteSubject implements Subject {
+  private observers: Observer[] = [];
+  
+  addObserver(observer: Observer): void {
+    this.observers.push(observer);
+  }
+  
+  notifyObservers(data: any): void {
+    this.observers.forEach(observer => observer.update(data));
+  }
+}
`;
			const files = ["src/patterns/observer.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("design-pattern-refactor");
		});

		it("should fallback to file-based naming", () => {
			const diff = `
diff --git a/src/utils/helper.ts b/src/utils/helper.ts
index 1234567..8901234 100644
--- a/src/utils/helper.ts
+++ b/src/utils/helper.ts
@@ -1,3 +1,4 @@
 export function helper() {
+  console.log('Updated helper function');
   return 'helper';
 }
`;
			const files = ["src/utils/helper.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("changed-helper");
		});

		it("should handle multiple files in fallback naming", () => {
			const diff = "";
			const files = ["src/file1.ts", "src/file2.ts"];
			const name = namer.generateName(diff, files);
			expect(name).toBe("modified-file1");
		});
	});

	describe("analyzeChanges", () => {
		it("should detect dependency changes", () => {
			const diff = `
diff --git a/package.json b/package.json
index 1234567..8901234 100644
--- a/package.json
+++ b/package.json
@@ -10,7 +10,7 @@
   "dependencies": {
-    "react": "^17.0.0",
+    "react": "^18.0.0"
   }
`;
			const files = ["package.json"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isDependencyChange).toBe(true);
		});

		it("should detect config changes", () => {
			const diff = "";
			const files = ["tsconfig.json"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isConfigChange).toBe(true);
		});

		it("should detect migration changes", () => {
			const diff = `
diff --git a/src/index.js b/src/index.js
deleted file mode 100644
diff --git a/src/index.ts b/src/index.ts
new file mode 100644
`;
			const files = ["src/index.js", "src/index.ts"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isMigration).toBe(true);
		});

		it("should detect feature additions", () => {
			const diff = `
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
new file mode 100644
diff --git a/src/components/Input.tsx b/src/components/Input.tsx
new file mode 100644
diff --git a/src/components/Card.tsx b/src/components/Card.tsx
new file mode 100644
diff --git a/src/components/Modal.tsx b/src/components/Modal.tsx
new file mode 100644
`;
			const files = [
				"src/components/Button.tsx",
				"src/components/Input.tsx",
				"src/components/Card.tsx",
				"src/components/Modal.tsx",
			];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isFeatureAddition).toBe(true);
		});

		it("should detect bug fixes", () => {
			const diff = `
// BUG: Fixed division by zero error
function divide(a, b) {
  if (b === 0) return 0;
  return a / b;
}
`;
			const files = ["src/math.ts"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isBugFix).toBe(true);
		});

		it("should detect build setup changes", () => {
			const diff = "";
			const files = ["webpack.config.js"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isBuildSetup).toBe(true);
		});

		it("should detect refactoring", () => {
			const diff = `
class OldClassName {
  method() {}
}

class NewClassName {
  method() {}
}
`;
			const files = ["src/refactor.ts"];

			// @ts-expect-error - accessing private method for testing
			const analysis = namer.analyzeChanges(diff, files);
			expect(analysis.isRefactoring).toBe(true);
		});
	});

	describe("checkDependencyChanges", () => {
		it("should detect package.json dependency changes", () => {
			const files = ["package.json"];
			const diff = `
"dependencies": {
  "react": "^17.0.0"
}
`;

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkDependencyChanges(files, diff);
			expect(result).toBe(true);
		});

		it("should detect lock file changes", () => {
			const files = ["package-lock.json"];
			const diff = "";

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkDependencyChanges(files, diff);
			expect(result).toBe(true);
		});
	});

	describe("checkConfigChanges", () => {
		it("should detect config file changes", () => {
			const files = ["tsconfig.json"];

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkConfigChanges(files);
			expect(result).toBe(true);
		});

		it("should not detect build config as general config", () => {
			const files = ["webpack.config.js"];

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkConfigChanges(files);
			expect(result).toBe(false);
		});
	});

	describe("checkMigration", () => {
		it("should detect JS to TS migration", () => {
			const files = ["src/index.ts"];
			const diff = "deleted file mode 100644";

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkMigration(files, diff);
			expect(result).toBe(true);
		});
	});

	describe("checkFeatureAddition", () => {
		it("should detect feature additions", () => {
			const files = [
				"src/components/Button.tsx",
				"src/components/Input.tsx",
				"src/components/Card.tsx",
				"src/components/Modal.tsx",
			];
			const diff = `
new file mode 100644
new file mode 100644
new file mode 100644
new file mode 100644
`;

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkFeatureAddition(files, diff);
			expect(result).toBe(true);
		});
	});

	describe("checkBugFix", () => {
		it("should detect bug fix patterns", () => {
			const files = ["src/bugfix.ts"];
			const diff = "// BUG: Fixed null pointer exception";

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkBugFix(files, diff);
			expect(result).toBe(true);
		});
	});

	describe("checkBuildSetup", () => {
		it("should detect build setup files", () => {
			const files = ["webpack.config.js"];

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkBuildSetup(files);
			expect(result).toBe(true);
		});
	});

	describe("checkRefactoring", () => {
		it("should detect refactoring patterns", () => {
			const files = ["src/refactor.ts"];
			const diff = "class OldName {}";

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkRefactoring(files, diff);
			expect(result).toBe(true);
		});
	});

	describe("checkAdvancedRefactoring", () => {
		it("should detect advanced refactoring patterns", () => {
			const files = ["src/patterns/singleton.ts"];
			const diff = "// Implementation of Singleton design pattern";

			// @ts-expect-error - accessing private method for testing
			const result = namer.checkAdvancedRefactoring(diff, files);
			expect(result).toBe(true);
		});
	});

	describe("nameDependencyChange", () => {
		it("should generate name for single package", () => {
			const analysis = { changedPackages: ["react"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameDependencyChange(analysis);
			expect(name).toBe("updated-react");
		});

		it("should generate name for multiple packages", () => {
			const analysis = { changedPackages: ["react", "vue", "angular"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameDependencyChange(analysis);
			expect(name).toBe("updated-3-packages");
		});

		it("should generate name for many packages", () => {
			const analysis = {
				changedPackages: Array.from({ length: 10 }, (_, i) => `package${i}`),
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameDependencyChange(analysis);
			expect(name).toBe("major-dependency-upgrade");
		});
	});

	describe("nameConfigChange", () => {
		it("should generate name for tsconfig changes", () => {
			const analysis = { configFiles: ["tsconfig.json"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameConfigChange(analysis);
			expect(name).toBe("typescript-config-update");
		});

		it("should generate name for env changes", () => {
			const analysis = { configFiles: [".env"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameConfigChange(analysis);
			expect(name).toBe("environment-config-change");
		});

		it("should generate fallback name for other configs", () => {
			const analysis = { configFiles: ["jest.config.js"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameConfigChange(analysis);
			expect(name).toBe("config-update");
		});
	});

	describe("nameMigration", () => {
		it("should generate name for small migration", () => {
			const analysis = { newFiles: 5 };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameMigration(analysis);
			expect(name).toBe("code-migration");
		});

		it("should generate name for large migration", () => {
			const analysis = { newFiles: 15 };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameMigration(analysis);
			expect(name).toBe("large-scale-migration");
		});
	});

	describe("nameFeature", () => {
		it("should generate name based on feature files", () => {
			const analysis = {
				files: ["src/features/user-authentication/login.ts"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameFeature(analysis);
			expect(name).toBe("added-user-authentication");
		});

		it("should generate fallback name when no feature files", () => {
			const analysis = { files: ["src/utils.ts"] };

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameFeature(analysis);
			expect(name).toBe("new-feature");
		});
	});

	describe("nameBugFix", () => {
		it("should generate name from bug description", () => {
			const analysis = {
				diff: "// BUG: Fixed null pointer exception in auth service",
				files: ["src/auth/service.ts"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBugFix(analysis);
			expect(name).toBe("fixed-null-pointer-exception-in-auth");
		});

		it("should generate name from component name", () => {
			const analysis = {
				diff: "// Some regular comment",
				files: ["src/components/Button.tsx"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBugFix(analysis);
			expect(name).toBe("fixed-Button");
		});

		it("should generate fallback name", () => {
			const analysis = {
				diff: "// Some regular comment",
				files: ["src/utils.ts"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBugFix(analysis);
			expect(name).toBe("bug-fix");
		});
	});

	describe("nameBuildSetup", () => {
		it("should generate name for specific build tool", () => {
			const analysis = {
				files: ["webpack.config.js"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBuildSetup(analysis);
			expect(name).toBe("build-setup-webpack");
		});

		it("should generate name for multiple build tools", () => {
			const analysis = {
				files: ["webpack.config.js", "babel.config.js"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBuildSetup(analysis);
			expect(name).toBe("build-setup-multi-tool");
		});

		it("should generate name for docker files", () => {
			const analysis = {
				files: ["Dockerfile"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBuildSetup(analysis);
			expect(name).toBe("build-setup-docker");
		});

		it("should generate name for package.json changes", () => {
			const analysis = {
				files: ["package.json"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBuildSetup(analysis);
			expect(name).toBe("build-setup-npm");
		});

		it("should generate fallback name", () => {
			const analysis = {
				files: ["unknown.config"],
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameBuildSetup(analysis);
			expect(name).toBe("build-setup-change");
		});
	});

	describe("nameRefactoring", () => {
		it("should generate name for large refactoring", () => {
			const analysis = {
				filesAffected: Array.from({ length: 15 }, (_, i) => `file${i}.ts`),
				diff: "some code changes",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameRefactoring(analysis);
			expect(name).toBe("large-refactoring");
		});

		it("should generate name for file renaming", () => {
			const analysis = {
				filesAffected: ["file.ts"],
				diff: "rename from old.ts\nrename to new.ts",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameRefactoring(analysis);
			expect(name).toBe("renamed-files");
		});

		it("should generate name for class restructuring", () => {
			const analysis = {
				filesAffected: ["class.ts"],
				diff: "class MyClass extends BaseClass",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameRefactoring(analysis);
			expect(name).toBe("class-restructure");
		});

		it("should generate name for module restructuring", () => {
			const analysis = {
				filesAffected: ["module.ts"],
				diff: 'import { something } from "module"',
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameRefactoring(analysis);
			expect(name).toBe("module-restructure");
		});

		it("should generate fallback name", () => {
			const analysis = {
				filesAffected: ["file.ts"],
				diff: "some regular changes",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameRefactoring(analysis);
			expect(name).toBe("refactoring");
		});
	});

	describe("nameAdvancedRefactoring", () => {
		it("should generate name for architecture refactoring", () => {
			const analysis = {
				diff: "Implementation of MVC pattern",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameAdvancedRefactoring(analysis);
			expect(name).toBe("architecture-refactor");
		});

		it("should generate name for design pattern refactoring", () => {
			const analysis = {
				diff: "Implementation of singleton pattern",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameAdvancedRefactoring(analysis);
			expect(name).toBe("design-pattern-refactor");
		});

		it("should generate fallback name", () => {
			const analysis = {
				diff: "Some advanced changes",
			};

			// @ts-expect-error - accessing private method for testing
			const name = namer.nameAdvancedRefactoring(analysis);
			expect(name).toBe("advanced-refactoring");
		});
	});

	describe("nameByFiles", () => {
		it("should generate name for single file", () => {
			const files = ["src/utils/helper.ts"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("changed-helper");
		});

		it("should generate name for multiple files", () => {
			const files = ["src/file1.ts", "src/file2.ts"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("modified-file1");
		});
	});

	describe("extractPackageChanges", () => {
		it("should extract package names from diff", () => {
			const diff = `
"dependencies": {
  "react": "^18.0.0",
  "lodash": "^4.17.21"
}
`;
			// @ts-expect-error - accessing private method for testing
			const packages = namer.extractPackageChanges(diff);
			expect(packages).toContain("react");
			expect(packages).toContain("lodash");
		});
	});

	describe("isValidPackageName", () => {
		it("should validate package names", () => {
			// @ts-expect-error - accessing private method for testing
			expect(namer.isValidPackageName("react")).toBe(true);
			// @ts-expect-error - accessing private method for testing
			expect(namer.isValidPackageName("@types/node")).toBe(true);
			// @ts-expect-error - accessing private method for testing
			expect(namer.isValidPackageName("src/utils.ts")).toBe(false);
		});
	});

	describe("extractConfigFiles", () => {
		it("should extract config files", () => {
			const files = ["tsconfig.json", "src/index.ts", ".env"];
			// @ts-expect-error - accessing private method for testing
			const configFiles = namer.extractConfigFiles(files);
			expect(configFiles).toContain("tsconfig.json");
			expect(configFiles).toContain(".env");
		});
	});

	describe("countNewFiles", () => {
		it("should count new files in diff", () => {
			const diff = `
new file mode 100644
new file mode 100644
`;
			// @ts-expect-error - accessing private method for testing
			const count = namer.countNewFiles(diff);
			expect(count).toBe(2);
		});
	});

	describe("countDeletedFiles", () => {
		it("should count deleted files in diff", () => {
			const diff = `
deleted file mode 100644
deleted file mode 100644
`;
			// @ts-expect-error - accessing private method for testing
			const count = namer.countDeletedFiles(diff);
			expect(count).toBe(2);
		});
	});

	describe("countLinesChanged", () => {
		it("should count lines changed in diff", () => {
			const diff = `
+added line
-removed line
+another added line
`;
			// @ts-expect-error - accessing private method for testing
			const count = namer.countLinesChanged(diff);
			expect(count).toBe(3);
		});
	});

	describe("extractFeatureName", () => {
		it("should extract feature name from file path", () => {
			const filePath = "src/features/user-authentication/login.ts";
			// @ts-expect-error - accessing private method for testing
			const name = namer.extractFeatureName(filePath);
			expect(name).toBe("user-authentication");
		});
	});

	describe("getBaseName", () => {
		it("should get base name from file path", () => {
			const filePath = "src/utils/helper.ts";
			// @ts-expect-error - accessing private method for testing
			const name = namer.getBaseName(filePath);
			expect(name).toBe("helper.ts");
		});
	});

	describe("edge cases", () => {
		it("should handle empty diff and files", () => {
			const name = namer.generateName("", []);
			expect(name).toBe("changed-undefined");
		});

		it("should handle special characters in file names", () => {
			const files = ["src/file with spaces.ts"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("changed-file with spaces");
		});

		it("should handle unicode file names", () => {
			const files = ["src/файл.ts"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("changed-файл");
		});

		it("should handle very long file paths", () => {
			const longPath = `src/${"a".repeat(100)}/file.ts`;
			const files = [longPath];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe(`changed-${"a".repeat(100)}`);
		});

		it("should handle files with no extension", () => {
			const files = ["Dockerfile"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("changed-Dockerfile");
		});

		it("should handle files with multiple dots", () => {
			const files = ["src/file.test.ts"];
			// @ts-expect-error - accessing private method for testing
			const name = namer.nameByFiles(files);
			expect(name).toBe("changed-file");
		});
	});
});
