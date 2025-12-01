# SnapBack Explorer Migration - Quick Implementation Guide

**Status**: Ready to implement
**Effort**: 8-11 hours
**Risk**: HIGH → MEDIUM (with comprehensive test coverage)

---

## Implementation Checklist

### Phase 1: Create New Tree Provider (2-3 hours)

-   [ ] **Create file**: `src/views/ProtectedFilesTreeProvider.ts`
-   [ ] **Create test**: `test/unit/views/ProtectedFilesTreeProvider.test.ts`
-   [ ] Implement `getTreeItem()` method
-   [ ] Implement `getChildren()` method (root level only)
-   [ ] Implement tree item construction with protection level emojis
-   [ ] Implement `refresh()` and event emitter
-   [ ] Add error handling
-   [ ] Verify all unit tests pass (95%+ coverage)

### Phase 2: Update Extension Registration (1 hour)

-   [ ] **Modify**: `src/extension.ts` lines 395-405
-   [ ] Replace dual registration with single `snapback.explorer` registration
-   [ ] Remove `snapback.main` registration
-   [ ] Remove `snapback.protectedFiles` registration
-   [ ] Update disposable management
-   [ ] Verify no duplicate registrations

### Phase 3: Update Package.json (30 minutes)

-   [ ] **Modify**: `package.json` views section
-   [ ] Replace `snapback.main` with `snapback.explorer`
-   [ ] Remove `snapback.protectedFiles` view
-   [ ] Update view `when` clauses
-   [ ] Update menu contributions to use `snapback.explorer`
-   [ ] Verify view configuration is valid

### Phase 4: Run Test Suites (1 hour)

-   [ ] Run unit tests: `pnpm test:unit`
-   [ ] Run regression tests: `pnpm test:regression`
-   [ ] Run type check: `pnpm check-types`
-   [ ] Run linting: `pnpm lint`
-   [ ] Verify coverage ≥ 95% for new code
-   [ ] Fix any failing tests

### Phase 5: Manual Verification (1 hour)

-   [ ] Build extension: `pnpm package-vsix`
-   [ ] Install in VSCode
-   [ ] Complete manual verification checklist (see test plan)
-   [ ] Test all protection level changes
-   [ ] Verify menu context
-   [ ] Verify timeline integration
-   [ ] Test edge cases

### Phase 6: Documentation (1 hour)

-   [ ] Update CHANGELOG.md
-   [ ] Update architecture documentation
-   [ ] Add migration notes
-   [ ] Document breaking changes (if any)

---

## Quick Reference: File Changes

### New Files

```
src/views/ProtectedFilesTreeProvider.ts
test/unit/views/ProtectedFilesTreeProvider.test.ts
test/unit/integration/ExplorerIntegration.test.ts
test/regression/issue-002-explorer-migration.test.ts
```

### Modified Files

```
src/extension.ts (lines 395-405)
package.json (views section)
```

### Deprecated Files

```
src/views/snapBackTreeProvider.ts (keep for now, remove later)
```

---

## Code Snippets

### 1. ProtectedFilesTreeProvider.ts (Basic Structure)

```typescript
import * as vscode from "vscode";
import type { ProtectedFileProvider, ProtectedFileEntry } from "./types";
import { PROTECTION_LEVELS } from "./types";

/**
 * Tree provider for the unified SnapBack Explorer view.
 * Replaces dual-view architecture (snapback.main + snapback.protectedFiles).
 */
export class ProtectedFilesTreeProvider
	implements vscode.TreeDataProvider<vscode.TreeItem>
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		vscode.TreeItem | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly protectedFiles: ProtectedFileProvider) {}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		// Only root level - no hierarchical structure
		if (element) {
			return [];
		}

		try {
			const files = await this.protectedFiles.list();

			// Sort by lastProtectedAt descending (newest first)
			const sortedFiles = files.sort(
				(a, b) => (b.lastProtectedAt ?? 0) - (a.lastProtectedAt ?? 0)
			);

			return sortedFiles.map((file) => this.createTreeItem(file));
		} catch (error) {
			console.error(
				"ProtectedFilesTreeProvider: Error loading files",
				error
			);
			return [];
		}
	}

	refresh(uri?: vscode.Uri): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}

	private createTreeItem(entry: ProtectedFileEntry): vscode.TreeItem {
		const item = new vscode.TreeItem(
			entry.label,
			vscode.TreeItemCollapsibleState.None
		);

		item.id = entry.id;
		item.contextValue = "snapback.item.protectedFile";

		// Add protection level emoji to description
		const level = entry.protectionLevel || "watch";
		const levelMetadata = PROTECTION_LEVELS[level];
		const relativePath = this.getRelativePath(entry.path);

		item.description = `${relativePath} ${levelMetadata.icon}`;
		item.tooltip = this.buildTooltip(entry, level);
		item.iconPath = new vscode.ThemeIcon("shield");

		// Command to open file on click
		item.command = {
			command: "vscode.open",
			title: "Open file",
			arguments: [vscode.Uri.file(entry.path)],
		};

		return item;
	}

	private getRelativePath(filePath: string): string {
		const folders = vscode.workspace.workspaceFolders;
		if (!folders || folders.length === 0) {
			return filePath;
		}

		const workspacePath = folders[0].uri.fsPath;
		return vscode.workspace.asRelativePath(filePath);
	}

	private buildTooltip(entry: ProtectedFileEntry, level: string): string {
		const levelMetadata = PROTECTION_LEVELS[level];
		const lines = [
			entry.label,
			entry.path,
			`Protection Level: ${levelMetadata.label} ${levelMetadata.icon}`,
			levelMetadata.description,
		];

		if (entry.lastProtectedAt) {
			lines.push(
				`Last protected: ${new Date(
					entry.lastProtectedAt
				).toLocaleString()}`
			);
		}

		return lines.join("\n");
	}
}
```

### 2. Extension.ts Changes (Lines 395-405)

**BEFORE**:

```typescript
context.subscriptions.push(
	vscode.window.registerTreeDataProvider(
		"snapback.main",
		snapBackTreeProvider
	)
);
context.subscriptions.push(
	vscode.window.registerTreeDataProvider(
		"snapback.protectedFiles",
		snapBackTreeProvider
	)
);
```

**AFTER**:

```typescript
// Register unified Explorer view
const protectedFilesTreeProvider = new ProtectedFilesTreeProvider(
	protectedFileRegistry
);

context.subscriptions.push(
	vscode.window.registerTreeDataProvider(
		"snapback.explorer",
		protectedFilesTreeProvider
	)
);
```

### 3. Package.json Views Section

**BEFORE**:

```json
"views": {
  "snapback": [
    {
      "id": "snapback.main",
      "name": "Checkpoints",
      "when": "snapback.isActive"
    },
    {
      "id": "snapback.protectedFiles",
      "name": "SnapBack",
      "when": "snapback.isActive"
    },
    {
      "id": "snapback.welcome",
      "name": "Getting Started",
      "when": "!snapback.isActive"
    }
  ]
}
```

**AFTER**:

```json
"views": {
  "snapback": [
    {
      "id": "snapback.explorer",
      "name": "SnapBack",
      "when": "snapback.isActive"
    },
    {
      "id": "snapback.welcome",
      "name": "Getting Started",
      "when": "!snapback.isActive"
    }
  ]
}
```

### 4. Package.json Menu Contributions

**Update all menu contributions**:

```json
"menus": {
  "view/item/context": [
    {
      "submenu": "snapback.protectionLevels",
      "when": "view == snapback.explorer && viewItem == snapback.item.protectedFile",
      "group": "inline@1"
    },
    {
      "command": "snapback.changeProtectionLevel",
      "when": "view == snapback.explorer && viewItem == snapback.item.protectedFile",
      "group": "inline@2"
    }
  ]
}
```

---

## Testing Commands

```bash
# During development (watch mode)
pnpm test:unit:watch

# Before commit
pnpm test:unit && pnpm test:regression && pnpm check-types && pnpm lint

# With coverage
pnpm test:coverage

# Build and install
pnpm package-vsix && code --install-extension snapback-vscode-*.vsix --force
```

---

## Pre-Merge Validation

### Automated Checks

```bash
✅ pnpm test:unit        # All unit tests pass
✅ pnpm test:regression  # All regression tests pass
✅ pnpm check-types      # 0 TypeScript errors
✅ pnpm lint             # 0 linting errors
✅ pnpm test:coverage    # ≥95% coverage for new code
```

### Manual Checks (from test plan)

-   [ ] Extension activates without errors
-   [ ] Only ONE SnapBack icon in Activity Bar
-   [ ] Protected files appear in Explorer
-   [ ] Emojis display correctly (🧢/👷/⛑️)
-   [ ] Protection level changes work
-   [ ] Context menus available
-   [ ] Timeline integration works
-   [ ] No duplicate views

---

## Rollback Plan

**If things go wrong**:

1. **Revert commits**:

    ```bash
    git revert HEAD~1  # Or specific commit
    ```

2. **Quick fix**: Comment out new registration, uncomment old:

    ```typescript
    // Temporary rollback
    // context.subscriptions.push(
    //   vscode.window.registerTreeDataProvider("snapback.explorer", protectedFilesTreeProvider)
    // );

    // Restore old views
    context.subscriptions.push(
    	vscode.window.registerTreeDataProvider(
    		"snapback.main",
    		snapBackTreeProvider
    	)
    );
    context.subscriptions.push(
    	vscode.window.registerTreeDataProvider(
    		"snapback.protectedFiles",
    		snapBackTreeProvider
    	)
    );
    ```

3. **Rebuild and reinstall**:
    ```bash
    pnpm package-vsix
    code --install-extension snapback-vscode-*.vsix --force
    ```

---

## Success Indicators

✅ All tests pass (0 failures)
✅ Coverage ≥ 95% for new code
✅ Manual checklist 100% complete
✅ Zero TypeScript/linting errors
✅ Single SnapBack view in Activity Bar
✅ No duplicate registrations
✅ Protection state persists correctly
✅ Performance feels snappy (< 100ms render)

---

## Common Issues and Solutions

### Issue: Tree not showing

**Solution**: Check `snapback.isActive` context is set

### Issue: Menu items not appearing

**Solution**: Verify `contextValue` is `snapback.item.protectedFile`

### Issue: Emojis not displaying

**Solution**: Check `PROTECTION_LEVELS` import and description formatting

### Issue: Files not sorted correctly

**Solution**: Verify `lastProtectedAt` sort logic

### Issue: Tests failing

**Solution**: Check mock setup in `test/unit/setup.ts`

---

## Timeline Estimate

| Phase                 | Time     | Cumulative |
| --------------------- | -------- | ---------- |
| Create tree provider  | 2-3h     | 2-3h       |
| Update extension.ts   | 1h       | 3-4h       |
| Update package.json   | 30m      | 3.5-4.5h   |
| Run test suites       | 1h       | 4.5-5.5h   |
| Manual verification   | 1h       | 5.5-6.5h   |
| Documentation         | 1h       | 6.5-7.5h   |
| **Buffer for issues** | 1.5-3.5h | **8-11h**  |

---

## Final Checklist Before Merge

-   [ ] All automated tests pass
-   [ ] Manual verification complete
-   [ ] Code coverage ≥ 95%
-   [ ] TypeScript errors = 0
-   [ ] Linting errors = 0
-   [ ] Documentation updated
-   [ ] CHANGELOG.md updated
-   [ ] Rollback plan tested
-   [ ] PR description complete
-   [ ] Reviewer assigned

---

**Ready to implement!** Follow this guide step-by-step for a smooth migration.

For detailed test specifications, see: `EXPLORER_MIGRATION_TEST_PLAN.md`
