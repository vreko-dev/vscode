# SnapBack Onboarding Plan

This document outlines the comprehensive onboarding plan for SnapBack that captures recommended protection level settings for all repo files with minimal friction.

## Overview

The onboarding plan focuses on providing a seamless experience for new users to quickly set up protection for their entire repository while understanding the different protection levels available.

## Key Components

### 1. Walkthrough Integration

The onboarding plan leverages VS Code's built-in walkthrough system to guide users through the core features:

1. **Meet Protection Levels** - Introduces the three protection levels:

    - 🧢 Watched: Silent auto-checkpoint on save
    - ⛑️ Warning: Notification before save with options
    - 👷‍♂️ Protected: Require checkpoint or explicit override

2. **Protect First File** - Guides users to right-click and protect their first file

3. **Smart Protection Suggestions** - Shows how SnapBack suggests protection for critical files

### 2. Repository-Wide Protection

The core feature of the onboarding plan is the "Protect Entire Repository" functionality:

-   **One-Click Setup**: Users can scan their entire repository with a single click
-   **Smart Categorization**: Files are automatically categorized by risk level
-   **Quick Review Interface**: Users can review and selectively apply recommendations
-   **Bulk Application**: Apply protection to multiple files simultaneously

### 3. Contextual Triggers

The onboarding experience is enhanced with contextual prompts:

-   **Package.json Modifications**: Prompt to add Warning protection when package.json is modified
-   **Environment Files**: Prompt to add Block protection for .env files
-   **Configuration Files**: Smart suggestions for other configuration files
-   **Revert Actions**: Prompt to protect files after users revert changes

### 4. Progressive Disclosure

The onboarding plan uses progressive disclosure to avoid overwhelming users:

-   **Phase 1**: Basic protection and manual checkpoints
-   **Phase 2**: Contextual prompts and protection levels
-   **Phase 3**: Bulk protection and timeline features
-   **Phase 4**: Advanced settings and team policies
-   **Phase 5**: Advanced restore and snapshot comparison

## Implementation Details

### RepoProtectionScanner Class

This class handles the scanning and recommendation process:

1. **File Discovery**: Uses fast-glob to find all relevant files in the workspace
2. **Risk Categorization**: Classifies files into:
    - 🔐 Sensitive Credentials (.env, secrets.json, etc.)
    - ⚙️ Configuration Files (package.json, tsconfig.json, etc.)
    - 📄 Source Code (.ts, .js, .py, etc.)
    - 📚 Documentation (.md, README, etc.)
3. **Recommendation Engine**: Assigns appropriate protection levels based on file type
4. **User Interface**: Provides a categorized quick pick interface for review

### Welcome View Enhancements

The welcome view has been enhanced with:

-   Prominent "Protect Entire Repository" button
-   Clear explanation of protection levels
-   Visual styling to guide users through onboarding

### ContextualTriggers Class

Provides smart suggestions based on user actions:

-   Real-time prompts when modifying critical files
-   Modal dialogs for high-risk files (like .env)
-   Helpful suggestions for configuration files

## Frictionless User Experience

The onboarding plan minimizes friction through:

1. **One-Click Repository Protection**: Scan and protect entire repository with one click
2. **Smart Defaults**: Automatically recommended protection levels based on file type
3. **Selective Application**: Users can review and selectively apply recommendations
4. **Progressive Learning**: Features are unlocked gradually as users become familiar
5. **Contextual Help**: Prompts appear at relevant moments in the user workflow

## Onboarding Techniques

### VS Code Extension API Features Used

1. **Walkthroughs**: Built-in guided tours using package.json contributes.walkthroughs
2. **QuickPick**: Categorized selection interface for reviewing recommendations
3. **Progress Notifications**: Visual feedback during scanning and protection processes
4. **Webview Views**: Enhanced welcome experience with styled HTML interface
5. **Commands**: Integrated commands for all onboarding actions
6. **Configuration**: Persistent onboarding state tracking

### User Engagement Strategies

1. **Celebration Moments**: Positive feedback when users complete onboarding milestones
2. **Progressive Unlocking**: New features unlocked as users advance through phases
3. **Contextual Relevance**: Prompts appear only when relevant to current user actions
4. **Visual Hierarchy**: Clear visual distinction between different protection levels
5. **Immediate Value**: Users see benefits immediately after protecting their first file

## Technical Implementation

### File Protection Recommendations

Files are categorized and recommended protection levels as follows:

1. **High-Risk (👷‍♂️ Protected)**:

    - .env files and variants
    - credentials.json, secrets.json
    - Private keys and sensitive configuration files

2. **Medium-Risk (⛑️ Warning)**:

    - package.json and package managers files
    - Build configuration files (webpack, vite, etc.)
    - Docker files and system configuration

3. **Standard-Risk (🧢 Watched)**:
    - Source code files (.ts, .js, .py, etc.)
    - Documentation files (.md, README, etc.)

### User Interface Components

1. **Welcome View**: Enhanced webview with prominent protect button
2. **QuickPick Interface**: Categorized file selection with "Select All" option
3. **Progress Indicators**: Visual feedback during scanning and protection
4. **Success Notifications**: Confirmation of protection application

## Future Enhancements

Potential future improvements to the onboarding experience:

1. **Team Collaboration**: Share protection rules across team members
2. **Custom Rules**: Allow users to define their own protection categorization
3. **Learning Analytics**: Track user behavior to optimize onboarding flow
4. **Interactive Tutorials**: Step-by-step guided protection setup
5. **Template Libraries**: Pre-built protection templates for popular frameworks

## Conclusion

This onboarding plan provides a comprehensive, frictionless experience for new SnapBack users. By combining VS Code's native walkthrough system with intelligent file scanning and contextual prompts, users can quickly understand and implement protection for their entire codebase with minimal effort.
