# Shell Integration

GitHub Desktop supports launching an available shell found on the user's
machine, to work with Git repositories outside of Desktop.

### My favourite shell XYZ isn't supported!

This is the checklist of things that it needs to support:

 - Desktop can check it exists on the user's machine
 - Desktop is able to launch it using the operating system's APIs
 - It has a stable interface (command line arguments) that doesn't change
   between updates

If you think your shell satisfies all these requirements please read on to
understand how Desktop integrates with each OS, and if you're still keen to
integrate this please fork and contribute a pull request for the team to
review.

## Windows

The source for the Windows shell integration is found in [`app/src/lib/shells/win32.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/shells/win32.ts).

These shells are currently supported:

 - Command Prompt (cmd)
 - PowerShell
 - [Hyper](https://hyper.sh/)
 - Git Bash (from [Git for Windows](https://git-for-windows.github.io/))

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Cmd = 'Command Prompt',
  PowerShell = 'PowerShell',
  Hyper = 'Hyper',
  GitBash = 'Git Bash',
}
```

To add another shell, add a new key to the `Shell` enum with a friendly name
for the value. You will need to add code in this module to find your shell, and I'll
use **Git Bash** as a reference for the rest of the process.

### Step 1: Find the shell executable

The `getAvailableShells()` method is used to find each shell, as some may not
be present on the user's machine. You will need to add some code in here.

For Git Bash we perform a couple of checks:

```ts
const gitBash = await readRegistryKeySafe(
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows'
)
if (gitBash.length > 0) {
  const installPathEntry = gitBash.find(e => e.name === 'InstallPath')
  if (installPathEntry) {
    shells.push({
      shell: Shell.GitBash,
      path: Path.join(installPathEntry.value, 'git-bash.exe'),
    })
  }
}
```

This approximately reads as:

 - check if Git for Windows has been installed, using the registry
 - if it is, check the installation path exists
 - return the path to `git-bash.exe` within that directory

### Step 2: Launch the shell

The `launch()` function defines the arguments to pass to the shell, and each
shell may require it's own set of command arguments. You will need to make
changes here.

```ts
} else if (shell === Shell.GitBash) {
  await spawn(foundShell.path, [`--cd="${path}"`], {
    shell: true,
    cwd: path,
})
```

## macOS

The source for the macOS shell integration is found in [`app/src/lib/shells/darwin.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/shell/darwin.ts).

These shells are currently supported:

 - Terminal
 - [Hyper](https://hyper.sh/)
 - [iTerm2](https://www.iterm2.com/)

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
}
```

If you want to add another shell, add a new key to the `Shell` enum with a
friendly name for the value.

There's a couple of places you need to add code to find your shell, and I'll
use Hyper as a reference to explain the rest of the process.

### Step 1: Find the shell application

The `getBundleID()` function is used to map a shell enum to it's bundle ID
that is defined in it's manifest. You should add a new entry here for your
shell.

```ts
case Shell.Hyper:
  return 'co.zeit.hyper'
```

After that, follow the existing patterns in `getAvailableShells()` and add a
new entry to lookup the install path for your shell.

```ts
export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [terminalPath, hyperPath, iTermPath] = await Promise.all([
    getShellPath(Shell.Terminal),
    getShellPath(Shell.Hyper),
    getShellPath(Shell.iTerm2),
  ])

  // other code

  if (hyperPath) {
    shells.push({ shell: Shell.Hyper, path: hyperPath })
  }

  // other code
}
```

### Step 2: Launch the shell

The launch step will use the `open` command in macOS to launch a given bundle
at the path requested by the user. You may not need to make changes here,
unless your shell behaviour differs significantly from this.

```ts
export async function launch(shell: Shell, path: string): Promise<void> {
  const bundleID = getBundleID(shell)
  const commandArgs = ['-b', bundleID, path]
  await spawn('open', commandArgs)
}
```

## Linux

The source for the Linux shell integration is found in [`app/src/lib/shells/linux.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/shell/linux.ts).

These shells are currently supported:

 - [GNOME Terminal](https://help.gnome.org/users/gnome-terminal/stable/)
 - [Tilix](https://github.com/gnunn1/tilix)
 - [Rxvt Unicode](http://software.schmorp.de/pkg/rxvt-unicode.html)
 - [Konsole](https://konsole.kde.org/)
 - [XTerm](http://invisible-island.net/xterm/)

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Gnome = 'GNOME Terminal',
  Tilix = 'Tilix',
  Urxvt = 'URxvt',
  Konsole = 'Konsole',
  Xterm = 'XTerm',
}
```

To add another shell, add a new key to the `Shell` enum with a friendly name
for the value. You will need to add code in this module to find your shell, and
I'll use Tilix as a reference for the rest of the process.

### Step 1: Find the shell application

The `getShellPath()` method is used to check if a given executable exists at a
path on disk. You should add some code in here to find your shell it's a known
location:

```ts
case Shell.Tilix:
  return getPathIfAvailable('/usr/bin/tilix')
```

After that, follow the existing patterns in `getAvailableShells()` and add a
new entry to lookup the install path for your shell.

```ts
export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell<Shell>>
> {
  const [gnomeTerminalPath, tilixPath] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Urxvt),
    getShellPath(Shell.Konsole),
    getShellPath(Shell.Xterm),
  ])

  ...

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
  }
}
```

### Step 2: Launch the shell

The `launch()` method will use the received `shell.shell` executable path and
the path requested by the user. You may need to make changes here, if your
shell has a different command line interface.

```ts
export async function launch(
  shell: IFoundShell<Shell>,
  path: string
): Promise<void> {
  if (shell.shell === Shell.Urxvt) {
    const commandArgs = ['-cd', path]
    await spawn(shell.path, commandArgs)
  }

  if (shell.shell === Shell.Konsole) {
    const commandArgs = ['--workdir', path]
    await spawn(shell.path, commandArgs)
  }

  if (shell.shell === Shell.Xterm) {
    const commandArgs = ['-e', '/bin/bash']
    const commandOptions = { cwd: path }
    await spawn(shell.path, commandArgs, commandOptions)
  }

  const commandArgs = ['--working-directory', path]
  await spawn(shell.path, commandArgs)
}

```
