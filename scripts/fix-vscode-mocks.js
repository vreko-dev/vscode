#!/usr/bin/env node
/**
 * Script to remove vi.mock("vscode", ...) blocks from test files
 * and replace with a comment explaining the global mock
 * 
 * Usage: node scripts/fix-vscode-mocks.js
 */

const fs = require('fs');
const path = require('path');

// Files to process (excluding setup.ts which is the canonical mock)
const filesToFix = [
  'test/unit/extension-api.spec.ts',
  'test/unit/ui/status-bar.spec.ts',
  'test/unit/ui/dialogs.a11y.spec.ts',
  'test/unit/suppressions/suppressions.spec.ts',
  'test/unit/logger.test.ts',
  'test/unit/mock-sanity.test.ts',
  'test/unit/protection-levels.spec.ts',
  'test/unit/events-notifications.spec.ts',
  'test/unit/config-sync.spec.ts',
  'test/unit/mcpView.test.ts',
  'test/unit/mcpConfigView.test.ts',
  'test/unit/bridges/SignalBridge.spec.ts',
  'test/unit/commands/sessionCommands.test.ts',
  'test/unit/demo-critical/ai-detection.test.ts',
  'test/unit/detection/ai-detector.test.ts',
  'test/unit/domain/prwManager.test.ts',
  'test/unit/notifications/protectionNotifications.test.ts',
  'test/unit/policy/PolicyPrecedence.test.ts',
  'test/unit/restore/restore-manager.test.ts',
  'test/unit/rules/RulesManager.test.ts',
  'test/unit/services/PreSnapshotService.test.ts',
  'test/unit/services/configFileScanner.test.ts',
  'test/unit/services/protectionDecorator.test.ts',
  'test/unit/services/snapshotSummaryProvider.test.ts',
  'test/unit/storage/snapshotStoreV2.test.ts',
  'test/unit/stress/high-file-count.test.ts',
  'test/unit/utils/SessionTagger.test.ts',
  'test/unit/utils/TipBudgetManager.test.ts',
  'test/unit/utils/progressReporter.test.ts',
  'test/unit/utils/statusBarAnimator.test.ts',
  'test/unit/utils/treeItemBadgeProvider.test.ts',
  'test/unit/views/SnapBackExplorerTreeProvider.test.ts',
  'test/unit/views/SnapBackTreeProvider.test.ts',
  'test/unit/views/protectedFilesTreeProvider.test.ts',
  'test/unit/views/protectedFilesTreeProvider.tierAware.test.ts',
  'test/unit/views/snapBackTreeProvider.badge.test.ts',
];

const REPLACEMENT_COMMENT = `// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.`;

function findMockBlockEnd(content, startIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    // Handle string literals
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    
    if (inString) continue;
    
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        // Find the end of the statement (semicolon or newline)
        let endIndex = i + 1;
        while (endIndex < content.length && content[endIndex] !== ';' && content[endIndex] !== '\n') {
          endIndex++;
        }
        if (content[endIndex] === ';') endIndex++;
        return endIndex;
      }
    }
  }
  
  return -1;
}

function removeMockBlock(content) {
  // Pattern to find vi.mock("vscode" or vi.mock('vscode'
  const mockPattern = /vi\.mock\s*\(\s*["']vscode["']/;
  const match = content.match(mockPattern);
  
  if (!match) {
    return { content, modified: false };
  }
  
  const startIndex = match.index;
  
  // Find where the mock starts (might have comments before)
  let blockStart = startIndex;
  
  // Look backwards for comment lines
  const lines = content.substring(0, startIndex).split('\n');
  let lastLineIndex = lines.length - 1;
  
  while (lastLineIndex >= 0) {
    const line = lines[lastLineIndex].trim();
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      lastLineIndex--;
    } else {
      break;
    }
  }
  
  // Calculate the actual start position
  if (lastLineIndex < lines.length - 1) {
    blockStart = lines.slice(0, lastLineIndex + 1).join('\n').length + 1;
  }
  
  // Find the end of the vi.mock(...) call
  const parenStart = content.indexOf('(', startIndex);
  const blockEnd = findMockBlockEnd(content, parenStart);
  
  if (blockEnd === -1) {
    console.error('Could not find end of mock block');
    return { content, modified: false };
  }
  
  // Skip any trailing newlines
  let actualEnd = blockEnd;
  while (actualEnd < content.length && (content[actualEnd] === '\n' || content[actualEnd] === '\r')) {
    actualEnd++;
  }
  
  // Replace the block with the comment
  const newContent = content.substring(0, blockStart) + REPLACEMENT_COMMENT + '\n\n' + content.substring(actualEnd);
  
  return { content: newContent, modified: true };
}

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  Skipping (not found): ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const result = removeMockBlock(content);
  
  if (result.modified) {
    fs.writeFileSync(fullPath, result.content);
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  } else {
    console.log(`⏭️  No vi.mock(vscode) found: ${filePath}`);
    return false;
  }
}

// Main execution
console.log('🔧 Removing vi.mock("vscode") blocks from test files...\n');

let fixedCount = 0;
for (const file of filesToFix) {
  if (processFile(file)) {
    fixedCount++;
  }
}

console.log(`\n✨ Done! Fixed ${fixedCount}/${filesToFix.length} files.`);
