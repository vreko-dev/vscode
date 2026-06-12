/**
 * JSON Schema for Vreko Context File
 *
 * Provides IDE intellisense for .vreko/ctx/context.json
 *
 * 🦎 Vreko
 */

export const CONTEXT_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://vreko.dev/schemas/context.json",
  "title": "Vreko Context",
  "description": "Project context and live state for AI assistants",
  "type": "object",
  "required": ["version", "generated", "meta", "live"],
  "properties": {
    "$schema": {
      "type": "string",
      "description": "JSON Schema reference"
    },
    "version": {
      "type": "string",
      "description": "Context schema version",
      "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$"
    },
    "generated": {
      "type": "string",
      "format": "date-time",
      "description": "Last update timestamp"
    },
    "meta": {
      "type": "object",
      "description": "Project metadata",
      "properties": {
        "id": { "type": "string", "description": "Project identifier" },
        "type": { "type": "string", "description": "Project type (nextjs, react, etc)" },
        "version": { "type": "string", "description": "Project version" }
      },
      "required": ["id", "type"]
    },
    "stack": {
      "type": "object",
      "description": "Detected technology stack",
      "additionalProperties": { "type": "string" }
    },
    "architecture": {
      "type": "object",
      "description": "Architecture decisions and constraints",
      "properties": {
        "privacy": { "enum": ["metadata-only", "full"] },
        "zeroShortcuts": { "type": "boolean" },
        "typeStrict": { "type": "boolean" },
        "layers": { "type": "array", "items": { "type": "string" } },
        "importDirection": { "type": "string" }
      }
    },
    "constraints": {
      "type": "object",
      "description": "Performance and size constraints"
    },
    "quality": {
      "type": "object",
      "description": "Quality requirements",
      "properties": {
        "typescript": {
          "type": "object",
          "properties": {
            "errors": { "type": "integer", "minimum": 0 },
            "strict": { "type": "boolean" }
          }
        },
        "coverage": {
          "type": "object",
          "properties": {
            "min": { "type": "integer", "minimum": 0, "maximum": 100 }
          }
        }
      }
    },
    "workflows": {
      "type": "object",
      "description": "Development workflows",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "protocol": {
      "type": "object",
      "description": "Communication protocol with AI",
      "properties": {
        "options": { "type": "string" },
        "references": { "type": "string" },
        "risks": { "type": "string" },
        "sizing": { "type": "string" }
      }
    },
    "live": {
      "type": "object",
      "description": "Live state updated by extension",
      "properties": {
        "snapshots": {
          "type": "object",
          "properties": {
            "today": { "type": "integer", "minimum": 0 },
            "total": { "type": "integer", "minimum": 0 },
            "lastCreated": { "type": ["string", "null"], "format": "date-time" }
          },
          "required": ["today", "total"]
        },
        "session": {
          "type": "object",
          "properties": {
            "id": { "type": ["string", "null"] },
            "aiTool": { "type": ["string", "null"] },
            "filesChanged": { "type": "array", "items": { "type": "string" } },
            "startedAt": { "type": ["string", "null"], "format": "date-time" }
          }
        },
        "vitals": {
          "type": "object",
          "properties": {
            "pulse": { "type": "integer", "minimum": 0, "maximum": 100 },
            "temperature": { "enum": ["cold", "warm", "hot"] },
            "risk": { "enum": ["L", "M", "H"] },
            "health": { "type": "integer", "minimum": 0, "maximum": 100 }
          }
        },
        "hotFiles": {
          "type": "array",
          "items": { "type": "string" },
          "maxItems": 5
        },
        "recentRestores": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "file": { "type": "string" },
              "timestamp": { "type": "string", "format": "date-time" }
            }
          },
          "maxItems": 5
        }
      },
      "required": ["snapshots", "session", "vitals", "hotFiles", "recentRestores"]
    },
    "learnings": {
      "type": "object",
      "description": "Learning system configuration (post-MVP)",
      "properties": {
        "location": { "type": "string" },
        "files": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}`;
