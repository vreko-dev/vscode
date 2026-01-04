# MCP Connection Troubleshooting Guide

This guide helps you diagnose and resolve MCP (Model Context Protocol) connection issues in the SnapBack VS Code extension.

## Quick Diagnostics

Run the built-in diagnostic command:
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run **SnapBack: Diagnose MCP Connection**

This shows connection status, circuit breaker state, and queue depth.

## Common Issues

### 1. MCP Server Not Connecting

**Symptoms:**
- Status bar shows "MCP ⚠"
- AI assistant features are limited
- Diagnose command shows "server not ready"

**Solutions:**
1. **Check MCP is enabled:**
   ```json
   // settings.json
   "snapback.mcp.enabled": true
   ```

2. **Verify server URL:**
   ```json
   // settings.json
   "snapback.mcp.serverUrl": "https://your-mcp-server.example.com"
   ```

3. **Check network connectivity:**
   - Ensure firewall allows outbound connections
   - Verify VPN/proxy settings if applicable

4. **Test server health manually:**
   ```bash
   curl https://your-mcp-server.example.com/health
   ```

### 2. Frequent Disconnections

**Symptoms:**
- Status bar frequently shows "MCP (1/3)", "(2/3)"
- "Reconnected successfully" messages appear often

**Causes & Solutions:**
1. **Network instability:**
   - Check your internet connection
   - Consider using a wired connection

2. **Server overload:**
   - Check server status page if available
   - Contact your MCP server administrator

3. **Timeout settings:**
   ```json
   // Increase timeout (default: 3000ms)
   "snapback.mcp.timeout": 5000
   ```

### 3. Circuit Breaker Open

**Symptoms:**
- Diagnose shows "Circuit breaker: 🔴 open"
- Push operations are being skipped
- Queue depth is growing

**What's happening:**
The circuit breaker opens after 5 consecutive failures to protect system stability. It automatically retries after 30 seconds.

**Solutions:**
1. **Wait for automatic recovery:**
   - The circuit breaker transitions to "half-open" after 30s
   - One successful push closes it completely

2. **Check server status:**
   - Verify the MCP server is running
   - Check server logs for errors

3. **Manual retry:**
   - Use the "Retry" button in disconnection notifications
   - Or restart VS Code to reset state

### 4. Large Queue Depth

**Symptoms:**
- Diagnose shows high pending observations/changes
- "Work is queued" message appears

**What's happening:**
Observations and file changes are queued when the server is unavailable.

**Solutions:**
1. **Resolve connection issues first**
2. **Queue will flush automatically** when connection is restored
3. **No data loss:** All queued items are preserved

### 5. Version Mismatch Warning

**Symptoms:**
- Warning: "MCP server may be outdated"
- Some features may not work correctly

**Solutions:**
1. **Update MCP server** to the recommended version
2. **Contact administrator** if using a shared server
3. **Check documentation** at https://docs.snapback.dev/mcp-upgrade

## Status Indicators

### Status Bar States

| Display | Meaning |
|---------|---------|
| (hidden) | Connected and healthy |
| $(plug) MCP ⚠ | Disconnected |
| $(sync~spin) MCP (1/3) | Reconnecting (attempt 1 of 3) |

### Circuit Breaker States

| State | Icon | Meaning |
|-------|------|---------|
| closed | ✅ | Normal operation, pushes allowed |
| open | 🔴 | Blocked, too many failures |
| half-open | 🟡 | Testing recovery with one request |

## Configuration Reference

```json
{
  // Enable/disable MCP integration
  "snapback.mcp.enabled": true,

  // Remote MCP server URL
  "snapback.mcp.serverUrl": "",

  // Authentication token
  "snapback.mcp.authToken": "",

  // Connection timeout (ms)
  "snapback.mcp.timeout": 3000,

  // Authentication type: "bearer" or "apikey"
  "snapback.mcp.authType": "bearer",

  // API key (when authType is "apikey")
  "snapback.mcp.apiKey": ""
}
```

## Recovery Scenarios

### Automatic Recovery

The extension automatically handles:
- **Reconnection:** Up to 3 attempts with exponential backoff
- **Circuit breaker reset:** 30-second cooldown then retry
- **Queue preservation:** No data loss during disconnections

### Manual Recovery Steps

1. **Run diagnostics:** `SnapBack: Diagnose MCP Connection`
2. **Check server status:** Verify server health endpoint
3. **Retry connection:** Click "Retry" in notification or run `SnapBack: Retry MCP Connection`
4. **Restart extension:** If issues persist, restart VS Code

## Telemetry Events

The extension tracks the following MCP events (anonymized):
- `mcp.connection.state_changed` - Connection state transitions
- `mcp.connection.retry` - Retry attempts
- `mcp.connection.version_mismatch` - Version compatibility warnings
- `mcp.bridge.circuit_changed` - Circuit breaker state changes
- `mcp.bridge.metrics` - Push success/failure metrics (batched)
- `mcp.diagnose.executed` - Diagnose command usage

These help us improve reliability. All telemetry follows SnapBack's privacy-first principles.

## Getting Help

1. **Check logs:** View > Output > SnapBack
2. **Report issues:** https://github.com/snapback-dev/snapback/issues
3. **Documentation:** https://docs.snapback.dev/mcp
