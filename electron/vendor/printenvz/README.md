# printenvz

A minimal Node.js native module that provides a compiled executable to output all environment variables to stdout, separated by null bytes (`\0`).

## Features

- **Native Executable**: Compiled C binary using node-gyp
- **Environment Variable Output**: Prints all environment variables separated by null bytes
- **JavaScript Interface**: Simple function to get the path to the compiled binary
- **TypeScript Support**: Includes TypeScript declaration file
- **Cross-platform**: Works on macOS, Linux, and Windows

## Installation

```bash
npm install
```

This will automatically build the native executable using node-gyp.

## Usage

### JavaScript/Node.js

```javascript
const { getPrintenvzPath } = require('printenvz');

// Get the path to the compiled native executable
const executablePath = getPrintenvzPath();
console.log(executablePath);
// Output: /path/to/printenvz/build/Release/printenvz

// Use with child_process to run the executable
const { execSync } = require('child_process');
const output = execSync(executablePath, { encoding: 'buffer' });

// Parse environment variables (split by null bytes)
const envVars = output.toString('utf8').split('\0').filter(s => s.length > 0);
console.log(envVars);
```

### TypeScript

```typescript
import { getPrintenvzPath } from 'printenvz';

const executablePath: string = getPrintenvzPath();
```

### Direct Executable Usage

```bash
./build/Release/printenvz | hexdump -C
```

## API

### `getPrintenvzPath(): string`

Returns the absolute path to the compiled native `printenvz` executable.

**Returns:** `string` - The path to the executable

## Build Commands

- `npm run build` - Build the native module
- `npm run rebuild` - Clean and rebuild the native module
- `npm run clean` - Clean build artifacts

## Files

- `src/printenvz.c` - C source code for the native executable
- `binding.gyp` - node-gyp build configuration
- `index.js` - JavaScript module with `getPrintenvzPath` function
- `index.d.ts` - TypeScript declaration file
- `package.json` - npm package configuration

## How it Works

1. The C source (`src/printenvz.c`) iterates through the global `environ` variable
2. Each environment variable is printed to stdout followed by a null byte (`\0`)
3. node-gyp compiles this into a native executable during `npm install`
4. The JavaScript module provides a helper function to locate the executable path

## License

MIT
