import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock vscode and window before importing TelemetryProxy
vi.mock('vscode', async () => {
  return {
    workspace: {
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue('https://api.snapback.dev'),
      }),
    },
    extensions: {
      getExtension: vi.fn().mockReturnValue({
        packageJSON: { version: '1.0.0' },
      }),
    },
    version: '1.75.0',
  };
});

import * as vscode from 'vscode';
import { TelemetryProxy } from '../../src/services/telemetry-proxy';

/**
 * Phase 1: RED Phase Test
 * Tests for network restoration triggering offline queue processing
 *
 * This test verifies setupNetworkMonitoring() wires network events to queue processing
 */

describe('TelemetryProxy - Offline Queue Network Integration', () => {
  let telemetryProxy: TelemetryProxy;
  let mockContext: any;

  beforeEach(() => {
    // Create mock VS Code context with globalState for OfflineEventQueue
    mockContext = {
      globalState: {
        get: vi.fn().mockReturnValue([]),
        update: vi.fn(),
      },
      extensionPath: '/test/ext',
      storagePath: '/test/storage',
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Network Restoration', () => {
    it('should process offline queue when network is restored (online event)', async () => {
      // Arrange: Initialize TelemetryProxy
      telemetryProxy = new TelemetryProxy(mockContext);

      // Spy on the internal processQueue method
      const processQueueSpy = vi.spyOn(telemetryProxy as any, 'processQueue');

      // Act: Simulate network restoration by firing 'online' event on globalThis
      const onlineEvent = new Event('online');
      (globalThis as any).dispatchEvent(onlineEvent);

      // Give async processing time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Assert: processQueue should have been called when 'online' event fired
      expect(processQueueSpy).toHaveBeenCalled();
      processQueueSpy.mockRestore();
    });

    it('should set up network event listeners in constructor', async () => {
      // Arrange: Create a spy for addEventListener on globalThis
      const addEventListenerSpy = vi.spyOn((globalThis as any), 'addEventListener');

      // Act: Initialize TelemetryProxy
      telemetryProxy = new TelemetryProxy(mockContext);

      // Assert: Should have registered 'online' listener
      const onlineListenerCalls = addEventListenerSpy.mock.calls.filter(
        call => call[0] === 'online'
      );

      // setupNetworkMonitoring() should register at least one 'online' listener
      expect(onlineListenerCalls.length).toBeGreaterThanOrEqual(1);

      addEventListenerSpy.mockRestore();
    });

    it('should handle errors during queue processing gracefully', async () => {
      // Arrange: Initialize TelemetryProxy
      telemetryProxy = new TelemetryProxy(mockContext);

      // Spy on processQueue and make it throw
      const processQueueSpy = vi.spyOn(telemetryProxy as any, 'processQueue')
        .mockRejectedValue(new Error('Network error'));

      // Act: Simulate network restoration
      const onlineEvent = new Event('online');
      (globalThis as any).dispatchEvent(onlineEvent);

      // Give async processing time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Assert: processQueue was called and error was handled gracefully
      expect(processQueueSpy).toHaveBeenCalled();

      processQueueSpy.mockRestore();
    });

    it('should call processQueue when network is restored', async () => {
      // Arrange: Initialize TelemetryProxy
      telemetryProxy = new TelemetryProxy(mockContext);

      // Spy on processQueue
      const processQueueSpy = vi.spyOn(telemetryProxy as any, 'processQueue');

      // Act: Simulate network restoration
      const onlineEvent = new Event('online');
      (globalThis as any).dispatchEvent(onlineEvent);

      // Give async processing time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Assert: Queue processing should be triggered by network restoration
      expect(processQueueSpy).toHaveBeenCalled();

      processQueueSpy.mockRestore();
    });
  });

  describe('Offline Mode', () => {
    it('should trigger immediate queue processing when online event fires', async () => {
      // Arrange: Initialize TelemetryProxy
      telemetryProxy = new TelemetryProxy(mockContext);

      // Spy on processQueue to verify it's called immediately
      const processQueueSpy = vi.spyOn(telemetryProxy as any, 'processQueue');

      // Act: Fire the 'online' event on globalThis
      const onlineEvent = new Event('online');
      (globalThis as any).dispatchEvent(onlineEvent);

      // Give async processing time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Assert: processQueue should be called exactly once in response to 'online' event
      expect(processQueueSpy).toHaveBeenCalledTimes(1);

      processQueueSpy.mockRestore();
    });
  });
});
