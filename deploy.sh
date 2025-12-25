#!/bin/bash

# Deploy Notebook Scanner plugin to Obsidian vault

VAULT="/Users/jackson/vaults/personal"
PLUGIN_DIR="$VAULT/.obsidian/plugins/notebook-scanner"

# Build
echo "Building..."
npm run build || exit 1

# Create plugin directory if needed
mkdir -p "$PLUGIN_DIR"

# Copy files
echo "Deploying to $PLUGIN_DIR"
cp main.js manifest.json styles.css "$PLUGIN_DIR/"

echo "Done! Restart Obsidian or disable/enable the plugin to reload."
