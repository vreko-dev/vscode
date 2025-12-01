# SnapBack Timeline API Integration Guide

This guide explains how to properly use the VS Code Timeline API in the SnapBack extension.

## Overview

The Timeline API is a proposed API in VS Code that allows extensions to contribute items to the timeline view. Since it's a proposed API, special handling is required.

## Setup

### 1. Enable the Timeline API Proposal

The timeline API proposal is already enabled in the [package.json](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/package.json) file:

```json
{
	"enabledApiProposals": ["timeline"]
}
```

### 2. Download Proposed API Types

To get proper TypeScript support, run:

```bash
npx @vscode/dts dev
```

This downloads the `vscode.proposed.timeline.d.ts` file which contains the type definitions for the timeline API.

### 3. Reference the Proposed API Types

In files that use the timeline API, add a reference to the downloaded types:

```typescript
/// <reference path="../../vscode.proposed.timeline.d.ts" />
```

## Implementation

### TimelineProvider Interface

The `CheckpointTimelineProvider` implements the `vscode.TimelineProvider` interface:

```typescript
export class CheckpointTimelineProvider implements vscode.TimelineProvider {
	readonly id = "snapback.checkpoints";
	readonly label = "SnapBack Snapshots";

	// Required properties
	readonly onDidChange: vscode.Event<vscode.TimelineChangeEvent | undefined>;
	async provideTimeline(
		uri: vscode.Uri,
		options: vscode.TimelineOptions,
		token?: vscode.CancellationToken
	): Promise<vscode.Timeline>;
}
```

### Registration

The timeline provider is registered in [phase5-registration.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/activation/phase5-registration.ts):

```typescript
if (timelineEnabled) {
	try {
		// Cast workspace to access proposed API
		const workspaceWithTimeline = vscode.workspace as any;
		if (workspaceWithTimeline.registerTimelineProvider) {
			timelineProviderDisposable =
				workspaceWithTimeline.registerTimelineProvider(
					["file", "untitled"],
					phase4Result.checkpointTimelineProvider
				);
		}
	} catch (error) {
		console.error("Failed to register timeline provider:", error);
	}
}
```

## Running the Extension

### Development Mode

When running the extension in development mode, the timeline API should work without additional flags.

### Production/Testing

When testing the extension or running it in production, you may need to enable the proposed API:

1. **Using VS Code Insiders**: The timeline API is more likely to work in VS Code Insiders.

2. **Using the --enable-proposed-api flag**: When launching VS Code, use:

    ```bash
    code --enable-proposed-api MarcelleLabs.snapback-vscode
    ```

3. **Configure runtime arguments**: Edit the `.vscode-insiders/argv.json` file (or `.vscode/argv.json` for regular VS Code):
    ```json
    {
    	"enable-proposed-api": ["MarcelleLabs.snapback-vscode"]
    }
    ```

## Troubleshooting

### Common Error Messages

1. **"Extension 'MarcelleLabs.snapback-vscode CANNOT USE these API proposals 'timeline'"**

    Solution: Ensure the extension is run with the `--enable-proposed-api` flag or that the `argv.json` file is configured correctly.

2. **TypeScript errors about missing Timeline types**

    Solution: Run `npx @vscode/dts dev` to download the proposed API types and reference them in your TypeScript files.

### Testing Timeline Functionality

1. Open a workspace with SnapBack enabled
2. Make changes to a file and save to create snapshots
3. Open the Timeline view (View → Open View… → Timeline)
4. You should see SnapBack snapshots in the timeline

## Best Practices

1. **Graceful Degradation**: Always check if the timeline API is available before using it.

2. **Error Handling**: Wrap timeline provider registration in try-catch blocks to prevent extension activation failures.

3. **Type Safety**: Use the downloaded proposed API types for better TypeScript support.

4. **Documentation**: Keep this guide updated as the timeline API evolves.
