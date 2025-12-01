# Protection Levels Guide

A comprehensive guide to using SnapBack's Protection Levels feature effectively in your development workflow.

## Table of Contents

-   [Introduction](#introduction)
-   [Real-World Examples](#real-world-examples)
-   [Step-by-Step Walkthroughs](#step-by-step-walkthroughs)
-   [Best Practices](#best-practices)
-   [Common Patterns](#common-patterns)
-   [Advanced Usage](#advanced-usage)

## Introduction

Protection Levels allow you to define how SnapBack handles file saves based on the criticality and change frequency of your files. Think of it as three different "modes" of protection:

-   **👁️ Watch**: For files you edit frequently—silent, invisible protection
-   **⚠️ Warn**: For important files—a gentle reminder with options
-   **🛑 Block**: For critical files—strict enforcement with no exceptions

The right protection level depends on two factors:

1. **How critical is the file?** (impacts production, affects multiple systems, etc.)
2. **How frequently do you edit it?** (constantly changing vs. occasional updates)

## Real-World Examples

### Example 1: Protecting Configuration Files (Block Level)

**Scenario**: You have a `.env.production` file that contains production database credentials and API keys. A mistake here could take down your production environment.

**Solution**: Use Block level protection.

**Steps**:

1. Right-click `.env.production` in the Explorer
2. Select "SnapBack: Protect File..."
3. Choose "🛑 Block - Require checkpoint or explicit override"

**What happens**:

-   Every time you try to save `.env.production`, you'll see a modal dialog
-   You MUST create a checkpoint before saving (or cancel the save)
-   No debouncing—you'll always be prompted
-   This prevents accidental changes from going live without a checkpoint

**Expected experience**:

```
[Modal Dialog appears]
File .env.production is protected at BLOCK level.
Create checkpoint before saving?

[Create Checkpoint & Save]  [Cancel Save]
```

If you click "Cancel Save", the file won't be saved. If you click "Create Checkpoint & Save", SnapBack creates a checkpoint first, then allows the save.

---

### Example 2: Active Development (Watch Level)

**Scenario**: You're building a new React component (`UserProfile.tsx`) and making dozens of small changes per hour. You want protection but don't want interruptions.

**Solution**: Use Watch level protection.

**Steps**:

1. Right-click `UserProfile.tsx` in the Explorer
2. Hover over "Quick Set Level"
3. Click "Set Protection: Watch (Silent)"

**What happens**:

-   SnapBack silently creates checkpoints as you save
-   300ms save debounce prevents checkpoint-on-every-keystroke
-   5-minute checkpoint debounce prevents checkpoint spam
-   You'll see a subtle status bar message: "✓ Checkpoint: UserProfile.tsx" (3 seconds)
-   Completely non-intrusive to your flow

**Expected experience**:

```
[You save the file]
[300ms later, SnapBack processes the save]
[If 5+ minutes since last checkpoint, creates a new one]
[Brief status bar message appears]
✓ Checkpoint: UserProfile.tsx
[Message disappears after 3 seconds]
```

---

### Example 3: Business Logic (Warn Level)

**Scenario**: You have a `paymentProcessor.ts` file that handles payment logic. It's important but not mission-critical like production config. You edit it occasionally (once a day or every few days).

**Solution**: Use Warn level protection.

**Steps**:

1. Open `paymentProcessor.ts`
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "SnapBack: Set Protection: Warn (Notify)"
4. Press Enter

**What happens**:

-   SnapBack automatically checkpoints the file when you save
-   A status bar alert confirms the snapshot and fades after 5 seconds
-   A notification appears with a "Restore Snapshot" action if you want to undo the save immediately
-   Debounce rules still apply (5 minutes) to avoid snapshot spam

**Expected experience**:

```
[You save the file]
[SnapBack creates a snapshot in the background]
[Status bar message]
👷 Snapshot captured for paymentProcessor.ts
[A notification appears with a Restore Snapshot button]
```

If you choose "Restore Snapshot", SnapBack restores the file to the pre-save state. Otherwise, the notification auto-dismisses and you keep working.

---

### Example 4: Bulk Protection

**Scenario**: You have a folder of database migration files (`migrations/`) and want to protect all 15 files at Block level.

**Solution**: Protect files individually (bulk operations coming soon).

**Current approach**:

1. Open the first migration file
2. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
3. Type "SnapBack: Set Protection: Block (Required)"
4. Press Enter
5. Repeat for each file

**Time-saving tip**: Use keyboard shortcuts:

-   `Ctrl+Tab` to switch to next file
-   `Ctrl+Shift+P` → Up Arrow → Enter (repeats last command)

**Coming soon**: Folder-level protection and bulk operations.

---

### Example 5: Changing Protection Levels

**Scenario**: You initially set `apiRoutes.ts` to Block level, but you're actively developing it now and the constant prompts are disruptive. You want to temporarily downgrade to Watch level.

**Solution**: Change the protection level.

**Steps**:

1. Right-click `apiRoutes.ts` in the Explorer
2. Select "SnapBack: Change Protection Level..."
3. Choose "👁️ Watch - Silent auto-checkpoint on save"

**What happens**:

-   The file's protection level is updated immediately
-   SnapBack now uses Watch behavior for this file
-   File decoration badge changes from 🛑 to 👁️
-   When you're done developing, you can change it back to Block

**Alternative approach** (faster):

1. Right-click `apiRoutes.ts`
2. Hover over "Quick Set Level"
3. Click "Set Protection: Watch (Silent)"

---

## Step-by-Step Walkthroughs

### Walkthrough 1: First Time Setup (Frontend Developer)

You're starting work on a React project and want to protect key files.

**Step 1: Protect your environment files (Block level)**

```
1. Right-click `.env.local` in Explorer
2. Select "SnapBack: Protect File..."
3. Choose "🛑 Block - Require checkpoint or explicit override"
4. Click OK

Result: .env.local now has a 🛑 badge in Explorer
```

**Step 2: Protect your main App component (Warn level)**

```
1. Right-click `src/App.tsx`
2. Select "SnapBack: Protect File..."
3. Choose "⚠️ Warn - Auto snapshot with notification"
4. Click OK

Result: src/App.tsx now has a ⚠️ badge
```

**Step 3: Protect your active development file (Watch level)**

```
1. Right-click `src/components/UserProfile.tsx`
2. Hover over "Quick Set Level"
3. Click "Set Protection: Watch (Silent)"

Result: UserProfile.tsx now has a 👁️ badge
```

**Step 4: Verify protection**

```
1. Click the SnapBack icon in the Activity Bar (left sidebar)
2. You'll see all three files listed with their protection levels:
   - .env.local 🛑
   - App.tsx ⚠️
   - UserProfile.tsx 👁️
```

**Step 5: Test the protection**

```
1. Open .env.local and make a change
2. Press Ctrl+S to save
3. You'll see a modal dialog requiring a checkpoint

✅ Protection is working!
```

---

### Walkthrough 2: Configuration-Heavy Project (DevOps Engineer)

You're managing infrastructure-as-code with many configuration files.

**Step 1: Identify critical files**

Critical files that should never change without checkpoints:

-   `terraform/production.tf`
-   `kubernetes/production-deployment.yaml`
-   `.github/workflows/deploy.yml`
-   `docker-compose.production.yml`

**Step 2: Protect all critical files at Block level**

```
For each file:
1. Right-click file in Explorer
2. Hover over "Quick Set Level"
3. Click "Set Protection: Block (Required)"

Result: All 4 files now have 🛑 badges
```

**Step 3: Protect development configs at Warn level**

Development files:

-   `terraform/staging.tf`
-   `kubernetes/staging-deployment.yaml`
-   `docker-compose.dev.yml`

```
For each file:
1. Right-click file
2. Hover over "Quick Set Level"
3. Click "Set Protection: Warn (Notify)"

Result: All 3 files now have ⚠️ badges
```

**Step 4: Daily workflow**

```
Morning:
- Open production.tf to make a change
- Save → Modal dialog appears
- "Create Checkpoint & Save" → Checkpoint created
- Continue working on other files

Afternoon:
- Open staging.tf to test changes
- Save → Warning message appears
- "Create Checkpoint" → Checkpoint created
- Deploy to staging

Evening:
- Review all checkpoints in SnapBack sidebar
- Restore if needed: Right-click checkpoint → "Snap Back"
```

---

## Best Practices

### When to Use Each Level

#### Use Watch (👁️) for:

-   Files you edit constantly (10+ times per day)
-   Active development work-in-progress
-   Personal configuration files (settings.json, .vscode/)
-   Test files and scripts
-   Documentation files (README.md, docs/)
-   Files where interruption would harm flow state

#### Use Warn (⚠️) for:

-   Important business logic (1-5 edits per day)
-   API route handlers
-   Database query files
-   Shared utility functions
-   Component libraries used across the app
-   Files where occasional reminders are helpful

#### Use Block (🛑) for:

-   Production environment configuration
-   Critical infrastructure-as-code
-   Security-sensitive files (auth, permissions)
-   Database schema definitions
-   CI/CD pipeline definitions
-   Files where mistakes have serious consequences

---

### How Many Files to Protect

**General guidelines**:

-   **5-10 files**: Ideal starting point
-   **10-20 files**: Common for medium projects
-   **20-50 files**: Large projects, consider patterns
-   **50+ files**: Wait for folder protection feature

**Quality over quantity**: It's better to protect 10 critical files well than 100 files poorly.

**Start small**: Begin with your top 5 most critical files, then expand based on experience.

---

### Performance Considerations

**SnapBack is optimized for protection**:

-   **O(1) lookup time**: Checking if a file is protected is instant
-   **Efficient debouncing**: Prevents checkpoint spam
-   **Event-driven updates**: File decorations update efficiently

**No noticeable performance impact** with:

-   Up to 100 protected files
-   1000+ total files in workspace
-   Rapid save operations

**Tips for large projects**:

-   Use Watch level for frequently-edited files (reduces prompt overhead)
-   Use Block level sparingly (only for truly critical files)
-   Enable debug logging only when troubleshooting

---

## Common Patterns

### Pattern 1: Frontend Development Workflow

**Files to protect**:

```
🛑 Block level:
  - .env.production
  - .env.staging
  - public/config.json

⚠️ Warn level:
  - src/App.tsx
  - src/api/client.ts
  - src/utils/auth.ts
  - src/contexts/UserContext.tsx

👁️ Watch level:
  - src/components/[current-feature]/*.tsx (files you're actively developing)
  - src/hooks/useCustomHook.ts (new hooks you're building)
```

**Workflow**:

1. Start day: Set new feature files to Watch
2. Complete feature: Change to Warn
3. Deploy to production: Review Block-level checkpoints
4. Start new feature: Set new files to Watch

---

### Pattern 2: Backend API Development

**Files to protect**:

```
🛑 Block level:
  - .env.production
  - database/schema.sql
  - docker-compose.production.yml

⚠️ Warn level:
  - src/routes/api/*.ts (all API routes)
  - src/middleware/auth.ts
  - src/services/payment.ts
  - database/migrations/*.sql

👁️ Watch level:
  - src/controllers/[current].ts (controller you're building)
  - tests/integration/*.test.ts
```

**Workflow**:

1. Create new API route → Set to Watch
2. Route stable and tested → Change to Warn
3. Deploy to production → Verify Block-level checkpoints
4. Refactor existing route → Temporarily set to Watch

---

### Pattern 3: Configuration Management

**Files to protect**:

```
🛑 Block level:
  - kubernetes/production/*.yaml
  - terraform/production/*.tf
  - .github/workflows/deploy-prod.yml

⚠️ Warn level:
  - kubernetes/staging/*.yaml
  - terraform/staging/*.tf
  - .github/workflows/deploy-staging.yml
  - ansible/playbooks/*.yml

👁️ Watch level:
  - kubernetes/development/*.yaml
  - terraform/development/*.tf
  - docker-compose.dev.yml
```

**Workflow**:

1. Test changes in dev files (Watch level)
2. Promote to staging (Warn level notifies for review)
3. Deploy to production (Block level requires explicit checkpoint)
4. Rollback if needed (use checkpoint history)

---

### Pattern 4: Database Migration Files

**Files to protect**:

```
🛑 Block level:
  - migrations/production/*.sql (already deployed)
  - migrations/rollback/*.sql

⚠️ Warn level:
  - migrations/pending/*.sql (ready for review)
  - migrations/schemas/*.sql

👁️ Watch level:
  - migrations/draft/*.sql (work in progress)
```

**Workflow**:

1. Create new migration → Save in `draft/` folder → Watch level
2. Ready for review → Move to `pending/` → Change to Warn
3. Deployed to production → Move to `production/` → Change to Block
4. Create rollback script → Save in `rollback/` → Block level

---

## Advanced Usage

### Using with Git Workflows

SnapBack checkpoints complement Git commits:

**Micro-checkpoints (SnapBack)**: Before every significant save
**Macro-commits (Git)**: When feature is complete

**Example workflow**:

```
1. Start feature → Create Git branch
2. Edit files → SnapBack auto-checkpoints (Watch level)
3. Test changes → SnapBack notifies (Warn level)
4. Ready to commit → Git commit + push
5. Deploy to production → SnapBack blocks (Block level)
```

**Checkpoint naming**:
SnapBack uses Git context for checkpoint names:

-   Branch name
-   Last commit message
-   Changed files

This makes it easy to correlate checkpoints with Git history.

---

### Debugging Protection Behavior

**Enable debug logging**:

1. Open VS Code Settings: `Ctrl+,` / `Cmd+,`
2. Search for "snapback.logLevel"
3. Set to "debug"
4. Open Output panel: `View → Output`
5. Select "SnapBack" from dropdown

**What you'll see**:

```
[DEBUG] isProtected check: /path/to/file.ts → true
[DEBUG] Protection level: watch
[DEBUG] Handling protected file save
[DEBUG] Debounce check: timeSinceLastCheckpoint=120000ms
[DEBUG] Skipping prompt due to debounce
[INFO] Creating checkpoint for file
[INFO] Checkpoint created successfully: cp_abc123
```

**Use debug logs to**:

-   Verify files are protected
-   Understand why prompts appear (or don't)
-   Troubleshoot debouncing behavior
-   Monitor checkpoint creation

---

### Integration with CI/CD

**Pre-commit hooks** with protected file checks:

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get list of changed files
CHANGED_FILES=$(git diff --cached --name-only)

# Check if any protected files changed
# (This is conceptual—SnapBack doesn't expose CLI yet)
# Coming soon: snapback check --changed-files

echo "Pre-commit checks passed"
exit 0
```

**Coming soon**:

-   CLI commands for CI/CD integration
-   Team-wide protection configuration
-   Protection policy enforcement

---

### Team Collaboration

**Sharing protection settings** (coming soon):

1. Export protection configuration:

    ```
    Command: "SnapBack: Export Protection Config"
    Result: .snapback/protection.json
    ```

2. Commit to repository:

    ```bash
    git add .snapback/protection.json
    git commit -m "Add SnapBack protection config"
    ```

3. Team members import:
    ```
    Command: "SnapBack: Import Protection Config"
    Result: All files protected according to team config
    ```

**Current workaround**:
Document protection recommendations in your project's README:

```markdown
## SnapBack Protection Recommendations

Please protect the following files:

-   🛑 Block: .env.production, terraform/production.tf
-   ⚠️ Warn: src/api/_.ts, database/migrations/_.sql
-   👁️ Watch: Your active development files
```

---

## Conclusion

Protection Levels give you fine-grained control over how SnapBack protects your files. Start with a few critical files, experiment with different levels, and adjust based on your workflow.

**Key takeaways**:

-   Use Block (🛑) sparingly for truly critical files
-   Use Warn (⚠️) for important files edited occasionally
-   Use Watch (👁️) for active development and frequently-changed files
-   Start with 5-10 files and expand gradually
-   Use debug logging to understand behavior
-   Adjust levels as your workflow evolves

**Need help?**

-   Check the [main README](../README.md) for configuration options
-   Review the [CHANGELOG](../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) if you find bugs
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy protecting! 🛡️
