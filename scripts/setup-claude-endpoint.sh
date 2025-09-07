#!/bin/bash

echo "🚀 Setting up Claude Sonnet 4 Endpoint for Moonshot MCP Server"
echo "================================================================="

# Check if Python3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python3 is required but not installed"
    exit 1
fi

# Check if the Moonshot backend directory exists
MOONSHOT_DIR="../../revised-moonshot"
if [ ! -d "$MOONSHOT_DIR" ]; then
    echo "❌ Error: Moonshot backend directory not found at $MOONSHOT_DIR"
    echo "Please ensure the revised-moonshot directory exists"
    exit 1
fi

echo "✅ Found Moonshot backend at $MOONSHOT_DIR"

# Check if the endpoint configuration exists
CLAUDE_CONFIG="../../revised-moonshot-data/connectors-endpoints/google-vertexai-claude-sonnet-4.json"
if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo "❌ Error: Claude Sonnet 4 configuration not found at $CLAUDE_CONFIG"
    echo "Please ensure the revised-moonshot-data directory is properly set up"
    exit 1
fi

echo "✅ Found Claude Sonnet 4 configuration"

# Run the endpoint registration script
echo "🔧 Registering Claude Sonnet 4 endpoint..."
cd "$(dirname "$0")"

if python3 endpoint-manager.py register google-vertexai-claude-sonnet-4; then
    echo "✅ Successfully registered Claude Sonnet 4 endpoint!"
    echo ""
    echo "🎉 Setup Complete!"
    echo "You can now use 'google-vertexai-claude-sonnet-4' in your red teaming sessions."
    echo ""
    echo "Example usage:"
    echo "  Use the red_team tool with model: 'google-vertexai-claude-sonnet-4'"
    echo ""
    echo "To verify the setup, run:"
    echo "  python3 endpoint-manager.py list-registered"
else
    echo "❌ Failed to register Claude Sonnet 4 endpoint"
    echo "Please check the error messages above and try again"
    exit 1
fi