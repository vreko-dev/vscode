#!/bin/bash

# VSCode Extension Documentation Consolidation Script

echo "Starting documentation consolidation..."

# Create new structure
mkdir -p docs/{user-guide,development,features,internal}
mkdir -p ARCHIVE/$(date +%Y%m%d)

# Consolidate bug documentation
echo "Consolidating bug documentation..."
{
  echo "<!--"
  echo "Consolidated from:"
  echo "- BUGFIXES.md ($(stat -f "%Sm" BUGFIXES.md))"
  echo "- BUG-004-FIX-REPORT.md ($(stat -f "%Sm" BUG-004-FIX-REPORT.md))"
  echo "- COMPREHENSIVE_BUG_FIX_REPORT.md ($(stat -f "%Sm" COMPREHENSIVE_BUG_FIX_REPORT.md))"
  echo "- CRITICAL_BUG_FIXES_IMPLEMENTED.md ($(stat -f "%Sm" CRITICAL_BUG_FIXES_IMPLEMENTED.md))"
  echo "- BUG_007_SUMMARY.md ($(stat -f "%Sm" BUG_007_SUMMARY.md))"
  echo "- BUG_7_ANALYSIS_GUIDE.md ($(stat -f "%Sm" BUG_7_ANALYSIS_GUIDE.md))"
  echo "- BUG_FIXES_SUMMARY.md ($(stat -f "%Sm" BUG_FIXES_SUMMARY.md))"
  echo "- BUG-004-008-FIX-SUMMARY.md ($(stat -f "%Sm" BUG-004-008-FIX-SUMMARY.md))"
  echo "- CRITICAL_BUG_FIXES_SUMMARY.md ($(stat -f "%Sm" CRITICAL_BUG_FIXES_SUMMARY.md))"
  echo "- INVESTIGATION_REPORT_BUG_007.md ($(stat -f "%Sm" INVESTIGATION_REPORT_BUG_007.md))"
  echo "- MANUAL_TEST_BUG_3.md ($(stat -f "%Sm" MANUAL_TEST_BUG_3.md))"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# Bug Fixes History"
  echo ""
} > docs/development/bug-fixes-history.md

# Append content from bug files (this is a simplified approach - in reality, we'd need to extract and merge content intelligently)
cat BUGFIXES.md >> docs/development/bug-fixes-history.md

# Create troubleshooting guide
echo "Creating troubleshooting guide..."
{
  echo "<!--"
  echo "Consolidated from bug documentation files"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# Troubleshooting Guide"
  echo ""
  echo "Common issues and solutions for SnapBack VS Code Extension."
  echo ""
} > docs/user-guide/troubleshooting.md

# Consolidate CI/CD documentation
echo "Consolidating CI/CD documentation..."
{
  echo "<!--"
  echo "Consolidated from:"
  echo "- docs/ci-cd-best-practices.md ($(stat -f "%Sm" docs/ci-cd-best-practices.md))"
  echo "- docs/ci-cd-changes-summary.md ($(stat -f "%Sm" docs/ci-cd-changes-summary.md))"
  echo "- docs/ci-cd-implementation-guide.md ($(stat -f "%Sm" docs/ci-cd-implementation-guide.md))"
  echo "- docs/CI-CD-IMPLEMENTATION-REPORT.md ($(stat -f "%Sm" docs/CI-CD-IMPLEMENTATION-REPORT.md))"
  echo "- docs/ci-cd-infrastructure.md ($(stat -f "%Sm" docs/ci-cd-infrastructure.md))"
  echo "- docs/ci-cd-quick-reference.md ($(stat -f "%Sm" docs/ci-cd-quick-reference.md))"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# CI/CD Guide"
  echo ""
} > docs/development/ci-cd-guide.md

# Add sections to CI/CD guide
{
  echo "## Quick Reference"
  echo ""
  cat docs/ci-cd-quick-reference.md | sed '1,/^#.*$/d'
  echo ""
  echo "## Infrastructure"
  echo ""
  cat docs/ci-cd-infrastructure.md | sed '1,/^#.*$/d'
  echo ""
  echo "## Implementation Guide"
  echo ""
  cat docs/ci-cd-implementation-guide.md | sed '1,/^#.*$/d'
  echo ""
  echo "## Best Practices"
  echo ""
  cat docs/ci-cd-best-practices.md | sed '1,/^#.*$/d'
} >> docs/development/ci-cd-guide.md

# Consolidate notification documentation
echo "Consolidating notification documentation..."
{
  echo "<!--"
  echo "Consolidated from:"
  echo "- ENHANCED_NOTIFICATIONS.md ($(stat -f "%Sm" ENHANCED_NOTIFICATIONS.md))"
  echo "- NOTIFICATION_INTEGRATION.md ($(stat -f "%Sm" NOTIFICATION_INTEGRATION.md))"
  echo "- NOTIFICATION_UPGRADE_SUMMARY.md ($(stat -f "%Sm" NOTIFICATION_UPGRADE_SUMMARY.md))"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# Notifications System"
  echo ""
} > docs/features/notifications.md

# Add content from notification files
cat ENHANCED_NOTIFICATIONS.md | sed '1,/^#.*$/d' >> docs/features/notifications.md
echo "" >> docs/features/notifications.md
cat NOTIFICATION_INTEGRATION.md | sed '1,/^#.*$/d' >> docs/features/notifications.md
echo "" >> docs/features/notifications.md
cat NOTIFICATION_UPGRADE_SUMMARY.md | sed '1,/^#.*$/d' >> docs/features/notifications.md

# Consolidate test documentation
echo "Consolidating test documentation..."
{
  echo "<!--"
  echo "Consolidated from:"
  echo "- INTEGRATION_TEST_COVERAGE.md ($(stat -f "%Sm" INTEGRATION_TEST_COVERAGE.md))"
  echo "- MANUAL_TEST_SUITE.md ($(stat -f "%Sm" MANUAL_TEST_SUITE.md))"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# Testing Guide"
  echo ""
} > docs/development/testing-guide.md

# Add content from test files
cat INTEGRATION_TEST_COVERAGE.md | sed '1,/^#.*$/d' >> docs/development/testing-guide.md
echo "" >> docs/development/testing-guide.md
cat MANUAL_TEST_SUITE.md | sed '1,/^#.*$/d' >> docs/development/testing-guide.md

# Consolidate quality assurance documentation
echo "Consolidating quality assurance documentation..."
{
  echo "<!--"
  echo "Consolidated from:"
  echo "- QUALITY_ASSURANCE_SUMMARY.md ($(stat -f "%Sm" QUALITY_ASSURANCE_SUMMARY.md))"
  echo "- QUALITY_VALIDATION_FINAL.md ($(stat -f "%Sm" QUALITY_VALIDATION_FINAL.md))"
  echo "- QUALITY_VALIDATION_REPORT.md ($(stat -f "%Sm" QUALITY_VALIDATION_REPORT.md))"
  echo "Last updated: $(date)"
  echo "-->"
  echo ""
  echo "# Quality Assurance"
  echo ""
} > docs/internal/quality-assurance.md

# Add content from QA files
cat QUALITY_ASSURANCE_SUMMARY.md | sed '1,/^#.*$/d' >> docs/internal/quality-assurance.md
echo "" >> docs/internal/quality-assurance.md
cat QUALITY_VALIDATION_FINAL.md | sed '1,/^#.*$/d' >> docs/internal/quality-assurance.md
echo "" >> docs/internal/quality-assurance.md
cat QUALITY_VALIDATION_REPORT.md | sed '1,/^#.*$/d' >> docs/internal/quality-assurance.md

# Move original files to archive
echo "Archiving original files..."
mkdir -p ARCHIVE/$(date +%Y%m%d)
mv BUG*.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv COMPREHENSIVE_BUG_FIX_REPORT.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv CRITICAL_BUG_FIXES*.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv INVESTIGATION_REPORT_BUG_007.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv MANUAL_TEST_BUG_3.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv docs/ci-cd-*.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv docs/CI-CD-IMPLEMENTATION-REPORT.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv ENHANCED_NOTIFICATIONS.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv NOTIFICATION_INTEGRATION.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv NOTIFICATION_UPGRADE_SUMMARY.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv INTEGRATION_TEST_COVERAGE.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv MANUAL_TEST_SUITE.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true
mv QUALITY*.md ARCHIVE/$(date +%Y%m%d)/ 2>/dev/null || true

# Move other documentation files to appropriate directories
echo "Moving remaining documentation files..."
cp SNAPBACK_FEATURES.md docs/user-guide/snapback-features.md

echo "Consolidation complete!"
echo "Original files archived to ARCHIVE/$(date +%Y%m%d)/"
echo "New documentation structure created in docs/ directory"