## MCP Integration

Connect AI tools directly to Vreko:

### For Cursor
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "vreko": {
      "command": "vreko-mcp"
    }
  }
}
```

### For Claude Desktop
Add to Claude config:
```json
{
  "mcpServers": {
    "vreko": {
      "command": "vreko-mcp"
    }
  }
}
```

### What AI Can Do
- Query snapshot history
- Understand file relationships
- Get pattern context for suggestions
- Learn from your codebase intelligence
