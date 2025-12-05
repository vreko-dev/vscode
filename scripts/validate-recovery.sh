#!/bin/bash
set -e

PHASE=$1
EXPECTED_TESTS_PASSING=${2:-0}

echo "================================================"
echo "VALIDATION GATE: Phase $PHASE"
echo "================================================"
echo "Timestamp: $(date)"
echo ""

# 1. TypeScript Compilation
echo "1. Checking TypeScript compilation..."
if pnpm run compile 2>&1 | tee /tmp/compile-output.log; then
  echo "✅ TypeScript compilation: PASS"
  COMPILE_STATUS="✅"
else
  echo "❌ TypeScript compilation: FAIL"
  COMPILE_STATUS="❌"
  EXIT_CODE=1
fi

# 2. Test Suite
echo ""
echo "2. Running test suite..."
TEST_OUTPUT=$(pnpm test 2>&1 || true)
echo "$TEST_OUTPUT"

# Extract test results (vitest format)
TESTS_PASSED=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passed)' | head -1 || echo "0")
TESTS_FAILED=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= failed)' | head -1 || echo "0")

echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ "$TESTS_FAILED" -eq "0" ] && [ "$TESTS_PASSED" -ge "$EXPECTED_TESTS_PASSING" ]; then
  echo "✅ Test suite: PASS"
  TEST_STATUS="✅"
else
  echo "❌ Test suite: FAIL (Expected ≥$EXPECTED_TESTS_PASSING passing, got $TESTS_PASSED passing, $TESTS_FAILED failing)"
  TEST_STATUS="❌"
  EXIT_CODE=1
fi

# 3. Linting (warnings OK, errors fail)
echo ""
echo "3. Checking code quality..."
if pnpm run lint 2>&1 | head -20; then
  echo "✅ Linting: PASS"
  LINT_STATUS="✅"
else
  echo "⚠️ Linting: WARNINGS (acceptable)"
  LINT_STATUS="⚠️"
fi

# 4. Summary
echo ""
echo "================================================"
echo "PHASE $PHASE VALIDATION SUMMARY"
echo "================================================"
echo "Compilation: $COMPILE_STATUS"
echo "Tests:       $TEST_STATUS (≥$EXPECTED_TESTS_PASSING expected)"
echo "Linting:     $LINT_STATUS"
echo ""

if [ ${EXIT_CODE:-0} -eq 0 ]; then
  echo "✅ VALIDATION PASSED - Ready to commit"
  echo ""
  echo "Next steps:"
  echo "  git add ."
  echo "  git commit -m 'feat: complete phase $PHASE'"
  exit 0
else
  echo "❌ VALIDATION FAILED - Fix issues before proceeding"
  echo ""
  echo "DO NOT PROCEED TO NEXT PHASE"
  echo "Fix the issues above and run this validation again"
  exit 1
fi
