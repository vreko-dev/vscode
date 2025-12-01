# SnapBack VS Code Extension - Coordinated Production Readiness Plan

**Status**: 81.1% test pass rate (421/519 tests passing) | Target: 95%+
**Production Score**: 75/100 | Target: 95/100
**Timeline**: 7 days with 2 developers (1 senior, 1 mid-level)
**Total Effort**: ~50 hours development work

## Executive Summary

Two specialized teams have completed comprehensive analysis:

-   **Quality Engineering Team**: Identified 19 P0 blockers across git integration, security, and core restore functionality
-   **Security Engineering Team**: Designed secure implementations for 3 critical security vulnerabilities

**Critical Finding**: Test failures stem from **implementation gaps**, not test design issues. Tests were written first (TDD), but implementations were never completed. This is a **positive scenario** - we have clear specifications to implement against.

---

## Team Reports Summary

### Quality Engineering Analysis

-   **19 P0 Blockers** requiring immediate attention
-   **Root Cause**: Missing methods in production code (tests call non-existent functions)
-   **Impact**: Core product features (restore, git integration, security) are broken
-   **Risk Level**: HIGH - product cannot ship in current state

### Security Engineering Analysis

-   **3 Critical Vulnerabilities** actively exploitable
-   **Credential Exposure**: No filtering in snapshot creation (plaintext secrets)
-   **Path Traversal**: No validation (attack vector for file system access)
-   **Injection Attacks**: No MCP response sanitization (XSS, SQL injection, command injection)
-   **Compliance Impact**: GDPR violations (PII exposure), OWASP Top 10 violations

---

## Phase 1: Critical Security Vulnerabilities (Day 1-2, 16 hours)

### Priority: BLOCKING - Must fix before ANY other work

#### Task 1.1: Implement Credential Filtering (6 hours)

**Owner**: Senior Developer
**Files to Create**:

-   `packages/storage/src/security/credential-filter.ts` (new file)

**Files to Modify**:

-   `packages/storage/src/adapters/fs.ts` (add filtering to `create()` method)

**Implementation Pattern**:

```typescript
// Pattern-based detection with 15+ credential patterns
// Recursive object scanning with sanitization
// Logging for security audit trail
const { filtered, detected } = CredentialFilter.filterCredentials(data);
```

**Test Validation**:

-   Run: `pnpm test packages/storage/test/security.test.ts`
-   Expected: 1 security test passes (credential filtering)

**Context7 Guidance**: Follow VS Code extension security patterns from official samples

---

#### Task 1.2: Implement Path Traversal Prevention (5 hours)

**Owner**: Senior Developer
**Files to Create**:

-   `packages/storage/src/security/path-validator.ts` (new file)

**Files to Modify**:

-   `packages/storage/src/adapters/fs.ts` (add validation to all file operations)
-   `apps/vscode/src/extension.ts` (add validation to file save handler, line 230)

**Implementation Pattern**:

```typescript
// Validate path before ANY file operation
const validation = PathValidator.validatePath(filePath, workspaceRoot);
if (!validation.isValid) {
	throw new Error(`Security violation: ${validation.reason}`);
}
```

**Test Validation**:

-   Run: `pnpm test packages/storage/test/security.test.ts`
-   Expected: 2 security tests pass (credential + path validation)

**Context7 Guidance**: Use Node.js path.normalize() and workspace boundary checks

---

#### Task 1.3: Implement MCP Response Validation (5 hours)

**Owner**: Mid-level Developer
**Files to Create**:

-   `packages/core/src/security/mcp-response-validator.ts` (new file)
-   `packages/core/src/security/audit-logger.ts` (new file)

**Files to Modify**:

-   `packages/core/src/mcp-client.ts` (add validation to `callToolWithResilience()`, lines 232-278)

**Implementation Pattern**:

```typescript
// Validate response before processing
const validation = MCPResponseValidator.validateResponse(
	response,
	serverName,
	toolName
);
if (!validation.isValid) {
	throw new Error(
		`Security validation failed: ${validation.threats.join(", ")}`
	);
}
return validation.sanitized || response;
```

**Test Validation**:

-   Run: `pnpm test packages/core/test/security.test.ts`
-   Expected: 3 security tests pass (all security validations working)

**Security Audit Point**: Run penetration testing after this phase

---

## Phase 2: Git Integration Foundation (Day 3-4, 16 hours)

### Priority: P0 - Core product functionality

#### Task 2.1: Implement GitIntegration Core Methods (10 hours)

**Owner**: Senior Developer
**Files to Modify**:

-   `packages/core/src/git-integration.ts` or similar (identify correct file first)

**Missing Methods to Implement** (from git-js Context7):

```typescript
async isRepository(path: string): Promise<boolean> {
  // Use git.checkIsRepo() from simple-git library
  return await git.checkIsRepo();
}

async getStatus(path: string): Promise<GitStatus> {
  // Use git.status() from simple-git library
  const status = await git.status();
  return {
    files: status.files,
    isClean: status.isClean(),
    ahead: status.ahead,
    behind: status.behind
  };
}

async getCurrentBranch(path: string): Promise<string> {
  // Use git.branch() to get current branch
  const branches = await git.branch();
  return branches.current;
}

async hasConflicts(path: string): Promise<boolean> {
  // Check git.status() for conflicted files
  const status = await git.status();
  return status.conflicted.length > 0;
}

async isWorkingTreeDirty(path: string): Promise<boolean> {
  // Use git.status() to check for uncommitted changes
  const status = await git.status();
  return !status.isClean();
}
```

**Dependencies**:

-   Install `simple-git` package: `pnpm add simple-git`
-   Import: `import simpleGit from 'simple-git'`

**Test Validation**:

-   Run: `pnpm test test/integration/gitIntegration.integration.test.ts`
-   Expected: 10 git integration tests pass

**Context7 Pattern**: Use simple-git library's checkIsRepo(), status(), branch() methods

---

#### Task 2.2: Implement Git Shadow Branch Operations (6 hours)

**Owner**: Senior Developer
**Files to Modify**:

-   Same git integration file from Task 2.1

**Missing Methods to Implement**:

```typescript
async createShadowBranch(path: string, branchName: string): Promise<void> {
  // Create branch without checking out
  await git.branch([branchName]);
}

async stashChanges(path: string): Promise<string> {
  // Stash with unique message
  const stashId = `snapback-${Date.now()}`;
  await git.stash(['push', '-m', stashId]);
  return stashId;
}

async applyShadowBranch(path: string, branchName: string): Promise<void> {
  // Checkout shadow branch
  await git.checkout(branchName);
}

async deleteShadowBranch(path: string, branchName: string): Promise<void> {
  // Delete branch forcefully if needed
  await git.deleteLocalBranch(branchName, true);
}

async listShadowBranches(path: string): Promise<string[]> {
  // List all branches starting with 'snapback-shadow-'
  const branches = await git.branchLocal();
  return Object.keys(branches.branches).filter(b =>
    b.startsWith('snapback-shadow-')
  );
}
```

**Test Validation**:

-   Run: `pnpm test test/integration/gitShadowBranch.integration.test.ts`
-   Expected: 9 git shadow branch tests pass

**Total Git Integration Tests**: 19 tests passing (10 + 9)

---

## Phase 3: Restore Operations & Core Features (Day 5, 8 hours)

### Priority: P0 - Main product value proposition

#### Task 3.1: Implement Backup Verification Logic (4 hours)

**Owner**: Mid-level Developer
**Files to Identify and Modify**:

-   Search for restore operation implementation: `grep -r "restore" apps/vscode/src/`
-   Likely in `operationCoordinator.ts` or dedicated restore service

**Missing Implementation**:

```typescript
async verifyBackup(checkpointId: string): Promise<VerificationResult> {
  // Read checkpoint metadata
  const checkpoint = await storage.retrieve(checkpointId);
  if (!checkpoint) {
    return { valid: false, reason: 'Checkpoint not found' };
  }

  // Verify all files exist
  const missingFiles = [];
  for (const file of checkpoint.meta.files || []) {
    const exists = await fs.access(file).then(() => true).catch(() => false);
    if (!exists) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    return {
      valid: false,
      reason: `Missing files: ${missingFiles.join(', ')}`
    };
  }

  // Verify file checksums if stored
  // ... checksum validation logic ...

  return { valid: true };
}

async restoreWithVerification(checkpointId: string): Promise<void> {
  // Verify before restore
  const verification = await this.verifyBackup(checkpointId);
  if (!verification.valid) {
    throw new Error(`Restore aborted: ${verification.reason}`);
  }

  // Proceed with restore
  await this.performRestore(checkpointId);
}
```

**Test Validation**:

-   Run: `pnpm test test/unit/backupVerification.test.ts`
-   Expected: 4 backup verification tests pass

---

#### Task 3.2: Fix MCP SDK Package Errors (2 hours)

**Owner**: Senior Developer
**Files to Modify**:

-   `packages/core/package.json` (check @modelcontextprotocol/sdk dependency)
-   Potentially need to update import statements

**Issue**:

```
Error: Failed to resolve entry for package "@modelcontextprotocol/sdk"
Missing "." specifier in "@modelcontextprotocol/sdk" package
```

**Fix Steps**:

1. Check package.json for correct SDK version
2. Update imports to use valid entry points
3. May need to update SDK version or fix exports field

**Test Validation**:

-   Run: `pnpm test` (all tests)
-   Expected: No MCP SDK resolution errors

---

#### Task 3.3: TypeScript Compilation Fixes (2 hours)

**Owner**: Mid-level Developer
**Files to Fix**:

-   Resolve 17 TypeScript compilation errors preventing VS Code test execution

**Fix Strategy**:

1. Run: `pnpm check-types` to identify errors
2. Fix type mismatches, missing imports, interface violations
3. Focus on test files that cannot compile

**Test Validation**:

-   Run: `pnpm check-types`
-   Expected: 0 TypeScript errors
-   Run: `pnpm test`
-   Expected: VS Code integration tests can execute

---

## Phase 4: Remaining P1 Issues (Day 6, 8 hours)

### Priority: HIGH - Important user features

#### Task 4.1: Fix Automatic Checkpoint Triggers (3 hours)

**Owner**: Mid-level Developer
**Test Count**: 5 failing tests
**Focus**: File save monitoring, time-based triggers, AI activity detection

#### Task 4.2: Fix MCP View Status Bar (2 hours)

**Owner**: Mid-level Developer
**Test Count**: 5 failing tests
**Focus**: Status bar updates, visual feedback, MCP connection status

#### Task 4.3: Fix Notification Frequency Tuning (2 hours)

**Owner**: Mid-level Developer
**Test Count**: 4 failing tests
**Focus**: Smart notification dismissal, frequency adaptation, user preference learning

#### Task 4.4: Implement Rate Limiting (1 hour)

**Owner**: Mid-level Developer
**Test Count**: Part of security validation
**Focus**: MCP tool call rate limiting (already designed in security implementation)

---

## Phase 5: Testing & Validation (Day 7, 8 hours)

### Priority: CRITICAL - Cannot ship without validation

#### Task 5.1: Comprehensive Test Suite Execution (2 hours)

**Owner**: Both Developers
**Actions**:

```bash
# Run all tests with coverage
pnpm test:coverage

# Expected results:
# - Test Files: 138 total, 130+ passing
# - Tests: 519 total, 495+ passing (95%+)
# - Coverage: 86.7% file coverage maintained
```

**Acceptance Criteria**:

-   ≥95% test pass rate (494+ tests passing)
-   Zero P0 test failures
-   Zero TypeScript compilation errors
-   All security tests passing

---

#### Task 5.2: Security Audit & Penetration Testing (3 hours)

**Owner**: Senior Developer
**Actions**:

1. Manual security review of all 3 security implementations
2. Attempt to bypass credential filtering with edge cases
3. Test path traversal with various attack vectors
4. Test MCP response injection with malicious payloads
5. Review security audit logs for proper event capture

**Acceptance Criteria**:

-   No vulnerabilities discovered
-   Security audit logs capture all test attempts
-   Credential filtering catches all pattern variations
-   Path validation rejects all traversal attempts
-   MCP validation sanitizes all injection payloads

---

#### Task 5.3: Integration Testing (2 hours)

**Owner**: Both Developers
**Actions**:

1. Test end-to-end snapshot creation with git integration
2. Test end-to-end restore with backup verification
3. Test security validation in real-world scenarios
4. Test MCP operations with rate limiting

**Test Scenarios**:

-   Create snapshot → includes git status → filters credentials → validates paths
-   Restore snapshot → verifies backup → checks git state → restores files
-   MCP tool call → validates response → enforces rate limit → logs security events

---

#### Task 5.4: Performance Benchmarking (1 hour)

**Owner**: Mid-level Developer
**Actions**:
Run performance tests and validate against benchmarks:

```bash
pnpm test test/performance/
```

**Acceptance Criteria**:

-   Extension activation: <2 seconds
-   Checkpoint creation: <5 seconds
-   Restore operation: <10 seconds
-   Large workspace (10K files): <20 seconds for analysis

---

## Production Readiness Checklist

### P0 Blockers (Must Complete)

-   [ ] **Security**: Credential filtering implemented and tested
-   [ ] **Security**: Path traversal prevention implemented and tested
-   [ ] **Security**: MCP response validation implemented and tested
-   [ ] **Git Integration**: 5 core methods implemented (isRepository, getStatus, getCurrentBranch, hasConflicts, isWorkingTreeDirty)
-   [ ] **Git Shadow Branch**: 5 shadow branch methods implemented
-   [ ] **Restore Operations**: Backup verification logic implemented
-   [ ] **MCP SDK**: Package resolution errors fixed
-   [ ] **TypeScript**: All compilation errors resolved
-   [ ] **Test Pass Rate**: ≥95% (494+ of 519 tests passing)

### P1 Important Features (Should Complete)

-   [ ] Automatic snapshot triggers working
-   [ ] MCP view status bar updates working
-   [ ] Notification frequency tuning working
-   [ ] Rate limiting implemented

### Quality Gates

-   [ ] Zero P0 test failures
-   [ ] Zero security vulnerabilities
-   [ ] Zero TypeScript compilation errors
-   [ ] Performance benchmarks met
-   [ ] Security audit completed
-   [ ] Integration tests passing

### Documentation

-   [ ] Security implementation documented
-   [ ] Git integration patterns documented
-   [ ] Update README with production status
-   [ ] Update CHANGELOG with security fixes

---

## Risk Assessment & Mitigation

### High Risk Areas

1. **Security Implementations** (Risk: HIGH)

    - **Mitigation**: Comprehensive penetration testing, security code review
    - **Fallback**: Feature flags to disable if issues found post-deployment

2. **Git Integration** (Risk: MEDIUM)

    - **Mitigation**: Extensive integration testing with real repositories
    - **Fallback**: Graceful degradation if git operations fail

3. **Restore Operations** (Risk: MEDIUM)
    - **Mitigation**: Backup verification prevents data loss
    - **Fallback**: Restore preview before execution

### Timeline Risks

-   **Risk**: 7-day timeline assumes zero blockers
-   **Mitigation**: Daily standup to identify blockers early
-   **Buffer**: Add 2-3 days for unexpected issues

---

## Daily Progress Tracking

### Day 1 (Security 1)

-   [ ] AM: Credential filtering implementation
-   [ ] PM: Path traversal prevention implementation
-   **Exit Criteria**: 2 security tests passing

### Day 2 (Security 2)

-   [ ] AM: MCP response validation implementation
-   [ ] PM: Security audit logging implementation
-   **Exit Criteria**: 3 security tests passing, penetration test successful

### Day 3 (Git 1)

-   [ ] AM: Install simple-git, implement isRepository/getStatus
-   [ ] PM: Implement getCurrentBranch/hasConflicts/isWorkingTreeDirty
-   **Exit Criteria**: 10 git integration tests passing

### Day 4 (Git 2)

-   [ ] AM: Implement shadow branch core methods
-   [ ] PM: Implement shadow branch list/delete operations
-   **Exit Criteria**: 9 shadow branch tests passing

### Day 5 (Core Features)

-   [ ] AM: Backup verification logic
-   [ ] PM: MCP SDK fixes + TypeScript compilation fixes
-   **Exit Criteria**: 4 restore tests passing, 0 TS errors

### Day 6 (P1 Features)

-   [ ] AM: Automatic snapshot triggers + MCP status bar
-   [ ] PM: Notification tuning + rate limiting
-   **Exit Criteria**: 14 additional tests passing

### Day 7 (Validation)

-   [ ] AM: Full test suite + security audit
-   [ ] PM: Integration testing + performance benchmarking
-   **Exit Criteria**: ≥95% pass rate, production ready

---

## Success Metrics

### Quantitative Targets

-   **Test Pass Rate**: 81.1% → 95%+ (73 more tests passing)
-   **Production Score**: 75/100 → 95/100 (+20 points)
-   **Security Vulnerabilities**: 3 critical → 0 critical
-   **P0 Blockers**: 19 → 0
-   **TypeScript Errors**: 17 → 0

### Qualitative Targets

-   All core product features functional (snapshot, restore, git integration)
-   Security vulnerabilities eliminated (credential exposure, path traversal, injection)
-   Production-ready code quality (no stub implementations, no TODOs)
-   Comprehensive test coverage maintained (86.7%)

---

## Post-Production Monitoring

### Week 1 After Release

-   Monitor security audit logs for attempted attacks
-   Track error rates for git operations
-   Measure restore success rates
-   Collect user feedback on snapshot reliability

### Metrics to Track

-   Security events per day (expect <10 with proper user guidance)
-   Git integration failure rate (target: <1%)
-   Restore operation success rate (target: >99%)
-   Extension activation time (target: <2s)

---

## Conclusion

**Readiness Assessment**: Currently NOT production ready (75/100)
**Path to Production**: 7 days of focused development
**Confidence Level**: HIGH (clear specifications, experienced team, proven patterns)

**Key Success Factors**:

1. Security-first approach prevents data breaches
2. TDD approach means clear specifications exist
3. Context7 guidance provides proven patterns
4. Experienced team coordination ensures efficiency

**Recommendation**: Proceed with 7-day sprint to achieve production readiness. Do NOT ship in current state due to critical security vulnerabilities and broken core features.
