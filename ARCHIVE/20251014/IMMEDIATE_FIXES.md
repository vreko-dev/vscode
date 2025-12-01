# ⚡ IMMEDIATE FIXES - Ship Blockers

**Status:** 🟡 MINOR FIXES NEEDED BEFORE SHIPPING
**Time Estimate:** 5 minutes
**Priority:** HIGH

---

## 🎯 Fix #1: Notification Timeout Consistency

**File:** `src/protection/ProtectionConfigManager.ts`

**Problem:** Inconsistent notification durations (some 1s, some 3s)

**Fix:**

```typescript
// Line 106 - Change 3000 to 1000
showStatusBarMessage(`Protected: ${relativePath}`, "lock", 1000);

// Line 121 - Change 3000 to 1000
showStatusBarMessage(`Unprotected: ${relativePath}`, "unlock", 1000);

// Line 150 - Change 3000 to 1000
showStatusBarMessage(`Protection changed to ${newLevel}`, "shield", 1000);

// Line 157 - Change 3000 to 1000
showStatusBarMessage(`Protection level ${newLevel}`, "shield", 1000);
```

**Verification:**

```bash
grep "showStatusBarMessage.*3000" src/protection/ProtectionConfigManager.ts
# Should return 0 matches after fix
```

---

## 📝 Fix #2: Document Watch Level Behavior

**File:** `README.md` or `docs/protection-levels.md`

**Add section:**

```markdown
### Watch Level Checkpoint Failure Behavior

**Important:** Watch level uses non-blocking checkpoint creation. If a checkpoint fails:

-   ✅ Save proceeds normally (workflow not interrupted)
-   ✅ User is notified with error message
-   ✅ "Retry" option provided

**Rationale:** Watch level prioritizes developer flow over strict protection.

**Alternative:** For strict checkpoint requirements, use Warn or Block levels.
```

---

## ✅ Verification Checklist

Before shipping:

-   [ ] Run: `grep "3000" src/protection/ProtectionConfigManager.ts` → No matches
-   [ ] Manual test: Protect file → Change level → Notification disappears in ~1 second
-   [ ] Manual test: Protect file → Save → Notification disappears in ~1 second
-   [ ] Documentation updated with Watch level behavior
-   [ ] Commit changes with message: "fix: standardize notification duration to 1000ms"

---

## 🚀 Post-Fix Actions

1. **Run tests:**

    ```bash
    pnpm run test:unit
    ```

2. **Package extension:**

    ```bash
    pnpm run package
    ```

3. **Install and verify:**
    ```bash
    code --install-extension snapback-vscode-*.vsix --force
    ```

---

**That's it!** Two simple changes and you're ready to ship. ✅
