#!/usr/bin/env bash

#
# Pre-Demo Validation Script
#
# Triple-run stability gate to ensure 0% test flakiness before demo.
# Runs all demo-critical tests 3 times and validates consistency.
#
# Usage: ./scripts/pre-demo.sh
#
# Exit codes:
#   0 - All tests passed all 3 runs (ready for demo)
#   1 - Tests failed or flakiness detected (not ready)
#

set -euo pipefail

echo "🎯 SnapBack Pre-Demo Validation"
echo "==============================="
echo ""
echo "Running triple-run stability gate..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VSCODE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$VSCODE_DIR"

# Test result tracking
declare -A run1_results
declare -A run2_results
declare -A run3_results

TOTAL_FAILURES=0
FLAKY_TESTS=()

# Function to run tests and capture results
run_test_suite() {
    local suite_name="$1"
    local command="$2"
    local run_number="$3"

    echo "${BLUE}Run $run_number/3: $suite_name${NC}"

    local start_time=$(date +%s)
    local exit_code=0

    # Run test and capture exit code
    if eval "$command" > "/tmp/snapback-test-run${run_number}-${suite_name}.log" 2>&1; then
        exit_code=0
    else
        exit_code=$?
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    if [ $exit_code -eq 0 ]; then
        echo "  ${GREEN}✓${NC} Passed (${duration}s)"
        return 0
    else
        echo "  ${RED}✗${NC} Failed (${duration}s)"
        echo "  Log: /tmp/snapback-test-run${run_number}-${suite_name}.log"
        return 1
    fi
}

# Function to check for flakiness
check_flakiness() {
    local suite_name="$1"
    local r1="$2"
    local r2="$3"
    local r3="$4"

    # All passed or all failed = consistent
    if [ "$r1" = "$r2" ] && [ "$r2" = "$r3" ]; then
        return 0
    fi

    # Different results = flaky
    echo "  ${YELLOW}⚠${NC} Flakiness detected in $suite_name"
    echo "    Run 1: $r1, Run 2: $r2, Run 3: $r3"
    FLAKY_TESTS+=("$suite_name")
    return 1
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Tier 1: Unit Tests (Demo-Critical)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

UNIT_SUITE="unit-demo-critical"
UNIT_CMD="pnpm exec vitest run test/unit/demo-critical --reporter=basic"

for run in 1 2 3; do
    if run_test_suite "$UNIT_SUITE" "$UNIT_CMD" "$run"; then
        eval "run${run}_results[$UNIT_SUITE]='PASS'"
    else
        eval "run${run}_results[$UNIT_SUITE]='FAIL'"
        ((TOTAL_FAILURES++))
    fi
done

echo ""
check_flakiness "$UNIT_SUITE" "${run1_results[$UNIT_SUITE]}" "${run2_results[$UNIT_SUITE]}" "${run3_results[$UNIT_SUITE]}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Tier 2: Integration Tests (Demo-Critical)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

INTEGRATION_SUITE="integration-demo-critical"
INTEGRATION_CMD="pnpm exec vitest run test/integration/demo-critical --reporter=basic"

for run in 1 2 3; do
    if run_test_suite "$INTEGRATION_SUITE" "$INTEGRATION_CMD" "$run"; then
        eval "run${run}_results[$INTEGRATION_SUITE]='PASS'"
    else
        eval "run${run}_results[$INTEGRATION_SUITE]='FAIL'"
        ((TOTAL_FAILURES++))
    fi
done

echo ""
check_flakiness "$INTEGRATION_SUITE" "${run1_results[$INTEGRATION_SUITE]}" "${run2_results[$INTEGRATION_SUITE]}" "${run3_results[$INTEGRATION_SUITE]}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Tier 3: E2E Tests (Demo-Critical)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

E2E_SUITE="e2e-demo-critical"
E2E_CMD="pnpm exec vscode-test --config .vscode-test.mjs"

for run in 1 2 3; do
    if run_test_suite "$E2E_SUITE" "$E2E_CMD" "$run"; then
        eval "run${run}_results[$E2E_SUITE]='PASS'"
    else
        eval "run${run}_results[$E2E_SUITE]='FAIL'"
        ((TOTAL_FAILURES++))
    fi
done

echo ""
check_flakiness "$E2E_SUITE" "${run1_results[$E2E_SUITE]}" "${run2_results[$E2E_SUITE]}" "${run3_results[$E2E_SUITE]}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Tier 4: VSIX Packaging"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

VSIX_SUITE="vsix-packaging"
VSIX_CMD="$SCRIPT_DIR/test-vsix.sh"

for run in 1 2 3; do
    if run_test_suite "$VSIX_SUITE" "$VSIX_CMD" "$run"; then
        eval "run${run}_results[$VSIX_SUITE]='PASS'"
    else
        eval "run${run}_results[$VSIX_SUITE]='FAIL'"
        ((TOTAL_FAILURES++))
    fi
done

echo ""
check_flakiness "$VSIX_SUITE" "${run1_results[$VSIX_SUITE]}" "${run2_results[$VSIX_SUITE]}" "${run3_results[$VSIX_SUITE]}"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Stability Analysis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Calculate statistics
TOTAL_RUNS=12  # 4 test suites × 3 runs
TOTAL_PASSES=$((TOTAL_RUNS - TOTAL_FAILURES))
PASS_RATE=$((TOTAL_PASSES * 100 / TOTAL_RUNS))

echo "Total Test Runs: $TOTAL_RUNS"
echo "Passes: $TOTAL_PASSES"
echo "Failures: $TOTAL_FAILURES"
echo "Pass Rate: ${PASS_RATE}%"
echo ""

# Show per-suite consistency
echo "Per-Suite Consistency:"
for suite in "$UNIT_SUITE" "$INTEGRATION_SUITE" "$E2E_SUITE" "$VSIX_SUITE"; do
    r1="${run1_results[$suite]}"
    r2="${run2_results[$suite]}"
    r3="${run3_results[$suite]}"

    if [ "$r1" = "$r2" ] && [ "$r2" = "$r3" ]; then
        if [ "$r1" = "PASS" ]; then
            echo "  ${GREEN}✓${NC} $suite: Consistent PASS (3/3)"
        else
            echo "  ${RED}✗${NC} $suite: Consistent FAIL (0/3)"
        fi
    else
        echo "  ${YELLOW}⚠${NC} $suite: FLAKY ($r1, $r2, $r3)"
    fi
done
echo ""

# Check for flakiness
FLAKY_COUNT=${#FLAKY_TESTS[@]}

if [ $FLAKY_COUNT -gt 0 ]; then
    echo "${YELLOW}⚠ FLAKINESS DETECTED${NC}"
    echo ""
    echo "The following test suites showed inconsistent results:"
    for test in "${FLAKY_TESTS[@]}"; do
        echo "  - $test"
    done
    echo ""
    echo "Flaky tests must be fixed before demo."
    echo ""
fi

# Final verdict
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Final Verdict"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $TOTAL_FAILURES -eq 0 ] && [ $FLAKY_COUNT -eq 0 ]; then
    echo "${GREEN}✓ READY FOR DEMO${NC}"
    echo ""
    echo "All tests passed all 3 runs with 0% flakiness."
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./scripts/demo-readiness.sh"
    echo "  2. Complete: DEMO_VERIFICATION_CHECKLIST.md"
    echo "  3. Launch demo environment: ./scripts/launch-demo-vscode.sh"
    echo "  4. Record demo video"
    echo ""
    exit 0
elif [ $TOTAL_FAILURES -gt 0 ] && [ $FLAKY_COUNT -eq 0 ]; then
    echo "${RED}✗ NOT READY - CONSISTENT FAILURES${NC}"
    echo ""
    echo "Some tests are consistently failing."
    echo "Fix failing tests before proceeding with demo."
    echo ""
    echo "Failure rate: $TOTAL_FAILURES/$TOTAL_RUNS runs failed"
    echo ""
    exit 1
elif [ $TOTAL_FAILURES -eq 0 ] && [ $FLAKY_COUNT -gt 0 ]; then
    echo "${YELLOW}⚠ NOT READY - FLAKINESS DETECTED${NC}"
    echo ""
    echo "All tests eventually passed, but some showed flaky behavior."
    echo "Flaky tests must be stabilized before demo."
    echo ""
    echo "Flaky suites: $FLAKY_COUNT"
    echo ""
    exit 1
else
    echo "${RED}✗ NOT READY - FAILURES AND FLAKINESS${NC}"
    echo ""
    echo "Multiple issues detected:"
    echo "  - Consistent failures: Check test logs"
    echo "  - Flakiness: Stabilize flaky tests"
    echo ""
    echo "Failure rate: $TOTAL_FAILURES/$TOTAL_RUNS runs failed"
    echo "Flaky suites: $FLAKY_COUNT"
    echo ""
    exit 1
fi
