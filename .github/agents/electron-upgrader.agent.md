---
name: electron-upgrader
description: Specialized agent for upgrading Electron and Node.js versions in GitHub Desktop with coordinated file updates
---

# Electron Version Upgrade Agent

This agent handles upgrading the Electron version in GitHub Desktop, along with the corresponding Node.js version update.

## Overview

When upgrading Electron, multiple files need to be updated in a coordinated way. The Electron upgrade and Node.js upgrade should be done in **separate commits** when possible.

## Required Information

Before starting, you need:
1. **New Electron version** (e.g., `39.0.0`)
2. **New Node.js version** that corresponds to the new Electron version (check [Electron Releases](https://releases.electronjs.org/) for the Node.js version bundled with each Electron release)

## Files to Update

### Commit 1: Electron Version Update

Update the following files with the new Electron version:

1. **`package.json`** - Update the `electron` version in `devDependencies`:
   ```json
   "devDependencies": {
     "electron": "NEW_ELECTRON_VERSION",
     ...
   }
   ```

2. **`app/.npmrc`** - Update the `target` value:
   ```properties
   runtime = electron
   disturl = https://electronjs.org/headers
   target = NEW_ELECTRON_VERSION
   ```

3. **`script/validate-electron-version.ts`** - Update the `beta` version in `ValidElectronVersions` (do NOT change `production`):
   ```typescript
   const ValidElectronVersions: Record<ChannelToValidate, string> = {
     production: 'KEEP_EXISTING_VERSION',
     beta: 'NEW_ELECTRON_VERSION',
   }
   ```

### Commit 2: Node.js Version Update

Update the following files with the new Node.js version:

1. **`.nvmrc`** - Update to new Node.js version (with `v` prefix):
   ```
   vNEW_NODE_VERSION
   ```

2. **`.node-version`** - Update to new Node.js version (without `v` prefix):
   ```
   NEW_NODE_VERSION
   ```

3. **`.tool-versions`** - Update the `nodejs` line:
   ```
   python 3.9.5
   nodejs NEW_NODE_VERSION
   ```

4. **`.github/workflows/ci.yml`** - Update the `NODE_VERSION` environment variable:
   ```yaml
   env:
     NODE_VERSION: NEW_NODE_VERSION
   ```

## Verification Steps

After making all changes:

1. **Run `yarn install`** to update dependencies:
   ```bash
   yarn install
   ```
   Ensure the command completes successfully without errors.

2. **Run `yarn build:dev`** to verify the build:
   ```bash
   yarn build:dev
   ```
   Ensure the build completes successfully without errors.

## Push and Create Draft Pull Request

After the build succeeds:

1. **Push the branch** to the remote repository:
   ```bash
   git push origin HEAD
   ```

2. **Create a Draft Pull Request** with the following format:

   **Title**: `Update Electron to version NEW_ELECTRON_VERSION`

   **Description**: The PR description should include:
   - A summary stating the Electron version being upgraded (from OLD_VERSION to NEW_VERSION)
   - The corresponding Node.js version update if applicable
   - **Breaking changes** between the previous Electron version and the new one
   - **⚠️ OS Compatibility Changes**: Explicitly highlight any macOS or Windows versions that are no longer supported in the new Electron version (Linux changes can be omitted)

   **Example PR Description**:
   ```markdown
   ## Summary

   This PR updates Electron from vOLD_VERSION to vNEW_VERSION.
   Node.js is also updated from vOLD_NODE to vNEW_NODE.

   ## Breaking Changes

   [List breaking changes from Electron release notes]

   ## ⚠️ OS Compatibility Changes

   The following operating system versions are **no longer supported** in Electron vNEW_VERSION:

   - **macOS**: [List any dropped macOS versions, e.g., "macOS 10.15 (Catalina) is no longer supported"]
   - **Windows**: [List any dropped Windows versions, e.g., "Windows 8.1 is no longer supported"]

   ## References

   - [Electron vNEW_VERSION Release Notes](https://github.com/electron/electron/releases/tag/vNEW_VERSION)
   ```

3. **Finding Breaking Changes**: 
   - Check the [Electron Releases page](https://github.com/electron/electron/releases) for the new version
   - Review the "Breaking Changes" section in the release notes
   - Check the [Electron Breaking Changes documentation](https://www.electronjs.org/docs/latest/breaking-changes) for the target major version
   - Pay special attention to minimum OS version requirements

## Commit Messages

Use descriptive commit messages:

- **Electron commit**: `Bump Electron to vNEW_ELECTRON_VERSION`
- **Node.js commit**: `Bump Node.js to vNEW_NODE_VERSION`

## Example Workflow

```bash
# Step 1: Update Electron version in package.json, app/.npmrc, and script/validate-electron-version.ts
# ... make edits ...

# Step 2: Commit Electron changes
git add package.json app/.npmrc script/validate-electron-version.ts
git commit -m "Bump Electron to v39.0.0"

# Step 3: Update Node.js version in .nvmrc, .node-version, .tool-versions, and ci.yml
# ... make edits ...

# Step 4: Commit Node.js changes
git add .nvmrc .node-version .tool-versions .github/workflows/ci.yml
git commit -m "Bump Node.js to v22.20.0"

# Step 5: Install dependencies and verify
yarn install
yarn build:dev

# Step 6: Push the branch and create a Draft PR
git push origin HEAD
# Create Draft PR with title "Update Electron to version 39.0.0"
# Include breaking changes and OS compatibility notes in the description
```

## Important Notes

- **Do NOT modify the `production` version** in `script/validate-electron-version.ts` - only update the `beta` version
- The `.nvmrc` file uses a `v` prefix (e.g., `v22.19.0`), while `.node-version` does not (e.g., `22.19.0`)
- Always verify the build works after making changes
- If `yarn install` or `yarn build:dev` fails, investigate and fix the issues before committing

## Current Versions (for reference)

As of the last update:
- Electron: `38.2.0`
- Node.js: `22.19.0`
