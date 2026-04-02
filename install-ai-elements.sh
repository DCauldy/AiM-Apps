#!/bin/bash

# AI Elements Installation Script
# Run this script when the registry is back online

echo "Installing AI Elements components..."
echo ""

# Install core components
echo "Installing conversation component..."
npx ai-elements@latest add conversation --yes

echo ""
echo "Installing message component..."
npx ai-elements@latest add message --yes

echo ""
echo "Installing prompt-input component..."
npx ai-elements@latest add prompt-input --yes

echo ""
echo "Checking for additional components..."

# Try to install response component if available
echo "Attempting to install response component..."
npx ai-elements@latest add response --yes 2>/dev/null || echo "Response component not available or already installed"

# Try to install loader component if available
echo "Attempting to install loader component..."
npx ai-elements@latest add loader --yes 2>/dev/null || echo "Loader component not available or already installed"

echo ""
echo "Installation complete!"
echo ""
echo "Components should be available in: components/ai-elements/"
echo ""
echo "Next steps:"
echo "1. Review the installed components"
echo "2. Follow the migration guide in AI_ELEMENTS_MIGRATION.md"
echo "3. Update your chat components to use AI Elements"
