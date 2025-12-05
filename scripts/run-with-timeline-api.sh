#!/bin/bash

# Script to run VS Code with the SnapBack extension and timeline API enabled
# This ensures the extension can access the proposed timeline API

echo "🚀 Starting VS Code with SnapBack extension and timeline API enabled..."

# Run VS Code with the enable-proposed-api flag
code --enable-proposed-api MarcelleLabs.snapback-vscode "$@"

echo "✅ VS Code started with timeline API enabled"