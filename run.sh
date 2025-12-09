#!/bin/bash

# Build and run GitHub Desktop in production mode (cross-platform)

set -e

# Kill any running instances of the app
echo "Checking for running instances..."
case "$(uname -s)" in
    Darwin)
        # Check if app is running and kill it
        if pgrep -f "GitHub Desktop" > /dev/null 2>&1; then
            echo "Closing GitHub Desktop..."
            # Try graceful quit first
            osascript -e 'quit app "GitHub Desktop"' 2>/dev/null || true
            osascript -e 'quit app "GitHub Desktop Dev"' 2>/dev/null || true
            sleep 1
            # Force kill if still running
            pkill -9 -f "GitHub Desktop" 2>/dev/null || true
            sleep 1
        fi
        ;;
    Linux)
        if pgrep -f "github-desktop" > /dev/null 2>&1; then
            echo "Closing GitHub Desktop..."
            pkill -9 -f "github-desktop" 2>/dev/null || true
            sleep 1
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        taskkill /F /IM "GitHub Desktop.exe" 2>/dev/null || true
        taskkill /F /IM "GitHub Desktop Dev.exe" 2>/dev/null || true
        sleep 1
        ;;
esac

echo "Building production app..."
npm run build:prod

echo "Launching GitHub Desktop..."

case "$(uname -s)" in
    Darwin)
        # macOS
        if [ "$(uname -m)" = "arm64" ]; then
            open "./dist/GitHub Desktop-darwin-arm64/GitHub Desktop.app"
        else
            open "./dist/GitHub Desktop-darwin-x64/GitHub Desktop.app"
        fi
        ;;
    Linux)
        # Linux
        if [ "$(uname -m)" = "x86_64" ]; then
            "./dist/GitHub Desktop-linux-x64/github-desktop"
        else
            "./dist/GitHub Desktop-linux-arm64/github-desktop"
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows (Git Bash, MSYS, Cygwin)
        if [ "$PROCESSOR_ARCHITECTURE" = "AMD64" ]; then
            "./dist/GitHub Desktop-win32-x64/GitHub Desktop.exe"
        else
            "./dist/GitHub Desktop-win32-arm64/GitHub Desktop.exe"
        fi
        ;;
    *)
        echo "Unsupported operating system: $(uname -s)"
        exit 1
        ;;
esac
