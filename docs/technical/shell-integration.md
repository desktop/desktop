# "Open Shell" integration

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

The source for the Windows shell integration is found in [`app/src/lib/shells/win32.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/shells/win32.ts).

These shells are currently supported:

 - Command Prompt (cmd)
 - PowerShell
 - [PowerShell Core](https://github.com/powershell/powershell/)
 - [Hyper](https://hyper.sh/)
 - Git Bash (from [Git for Windows](https://git-for-windows.github.io/))
 - [Cygwin](https://www.cygwin.com/)
 - [WSL](https://docs.microsoft.com/en-us/windows/wsl/about) (beta)
 - [Windows Terminal](https://github.com/microsoft/terminal)
 - [Alacritty](https://github.com/alacritty/alacritty)
 - [Fluent Terminal](https://github.com/felixse/FluentTerminal)

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Cmd = 'Command Prompt',
  PowerShell = 'PowerShell',
  PowerShellCore = 'PowerShell Core',
  Hyper = 'Hyper',
  GitBash = 'Git Bash',
  Cygwin = 'Cygwin',
  WSL = 'WSL',
  WindowTerminal = 'Windows Terminal',
  Alacritty = 'Alacritty',
}
```

To add another shell, add a new key to the `Shell` enum with a friendly name
for the value. You will need to add code in this module to find your shell, and I'll
use **Git Bash** as a reference for the rest of the process.

### Step 1: Find the shell executable

The `getAvailableShells()` method is used to find each shell, as some may not
be present on the user's machine.

This is the example for how we resolve if Git Bash is installed.

```ts
  const gitBashPath = await findGitBash()
  if (gitBashPath != null) {
    shells.push({
      shell: Shell.GitBash,
      path: gitBashPath,
    })
  }
```

You will need to add some code in here, following this pattern, to resolve a new shell.

The details of this check will vary based on the how the shell is installed,
but Git Bash is a good example of this:

```ts
async function findGitBash(): Promise<string | null> {
  const registryPath = enumerateValues(
    HKEY.HKEY_LOCAL_MACHINE,
    'SOFTWARE\\GitForWindows'
  )

  if (registryPath.length === 0) {
    return null
  }

  const installPathEntry = registryPath.find(e => e.name === 'InstallPath')
  if (installPathEntry && installPathEntry.type === RegistryValueType.REG_SZ) {
    const path = Path.join(installPathEntry.data, 'git-bash.exe')

    if (await pathExists(path)) {
      return path
    } else {
      log.debug(
        `[Git Bash] registry entry found but does not exist at '${path}'`
      )
    }
  }

  return null
}
```

This approximately reads as:

 - check if Git for Windows has been installed, using the registry
 - if it is, check the installation path exists
 - return the path to `git-bash.exe` within that directory

### Step 2: Parse the shell

The `parse()` function is used to parse shell names. You should add a new entry here for your
shell.

```ts
if (label === Shell.GitBash) {
  return Shell.GitBash
}
```

### Step 3: Launch the shell

The `launch()` function defines the arguments to pass to the shell, and each
shell may require it's own set of command arguments. You will need to make
changes here to handle a new shell.

```ts
  case Shell.GitBash:
    const gitBashPath = `"${foundShell.path}"`
    log.info(`launching ${shell} at path: ${gitBashPath}`)
    return spawn(gitBashPath, [`--cd="${path}"`], {
      shell: true,
      cwd: path,
    })
```

## macOS

The source for the macOS shell integration is found in [`app/src/lib/shells/darwin.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/shells/darwin.ts).

These shells are currently supported:

 - Terminal
 - [Hyper](https://hyper.sh/)
 - [iTerm2](https://www.iterm2.com/)
 - [PowerShell Core](https://github.com/powershell/powershell/)
 - [Kitty](https://sw.kovidgoyal.net/kitty/)
 - [Alacritty](https://github.com/alacritty/alacritty)
 - [Tabby](https://tabby.sh/)
 - [WezTerm](https://github.com/wez/wezterm)

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
  PowerShellCore = 'PowerShell Core',
  Kitty = 'Kitty',
}
```

If you want to add another shell, add a new key to the `Shell` enum with a
friendly name for the value.

There's a couple of places you need to add code to find your shell, and I'll
use Hyper as a reference to explain the rest of the process.

### Step 1: Find the shell application

The `getBundleIDs()` function is used to map a shell enum to the possible bundle IDs
that are defined in its manifest. You should add a new entry here for your
shell. An array is returned to handle the case where a shell updates its bundle ID.

```ts
case Shell.Hyper:
  return ['co.zeit.hyper']
```

After that, follow the existing patterns in `getAvailableShells()` and add a
new entry to lookup the install path for your shell.

```ts
export async function getAvailableShells(): Promise<
  ReadonlyArray<FoundShell<Shell>>
> {
  const [
    terminalInfo,
    hyperInfo,
    iTermInfo,
    powerShellCoreInfo,
    kittyInfo,
  ] = await Promise.all([
    getShellInfo(Shell.Terminal),
    getShellInfo(Shell.Hyper),
    getShellInfo(Shell.iTerm2),
    getShellInfo(Shell.PowerShellCore),
    getShellInfo(Shell.Kitty),
  ])

  // other code

  if (hyperInfo) {
    shells.push({ shell: Shell.Hyper, ...hyperInfo })
  }

  // other code
}
```

### Step 2: Launch the shell

The launch step will use the `open` command in macOS to launch a given bundle
at the path requested by the user. You may not need to make changes here,
unless your shell behaviour differs significantly from this.

```ts
export function launch(
  foundShell: FoundShell<Shell>,
  path: string
): ChildProcess {
  return spawn('open', ['-b', foundShell.bundleID, path])
}
```

## Linux

The source for the Linux shell integration is found in [`app/src/lib/shells/linux.ts`](https://github.com/desktop/desktop/blob/development/app/src/lib/shells/linux.ts).

These shells are currently supported:

 - [GNOME Terminal](https://help.gnome.org/users/gnome-terminal/stable/)
 - [MATE Terminal](https://github.com/mate-desktop/mate-terminal)
 - [Tilix](https://github.com/gnunn1/tilix)
 - [Terminator](https://gnometerminator.blogspot.com)
 - [Rxvt Unicode](http://software.schmorp.de/pkg/rxvt-unicode.html)
 - [Konsole](https://konsole.kde.org/)
 - [XTerm](http://invisible-island.net/xterm/)
 - [Terminology](https://www.enlightenment.org/docs/apps/terminology.md)

These are defined in an enum at the top of the file:

```ts
export enum Shell {
  Gnome = 'GNOME Terminal',
  Mate  = 'MATE Terminal',
  Tilix = 'Tilix',
  Terminator = 'Terminator',
  Urxvt = 'URxvt',
  Konsole = 'Konsole',
  Xterm = 'XTerm',
  Terminology = 'Terminology',
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
  ReadonlyArray<FoundShell<Shell>>
> {
  const [
    gnomeTerminalPath,
    mateTerminalPath,
    tilixPath,
    terminatorPath,
    urxvtPath,
    konsolePath,
    xtermPath,
    terminologyPath,
  ] = await Promise.all([
    getShellPath(Shell.Gnome),
    getShellPath(Shell.Mate),
    getShellPath(Shell.Tilix),
    getShellPath(Shell.Terminator),
    getShellPath(Shell.Urxvt),
    getShellPath(Shell.Konsole),
    getShellPath(Shell.Xterm),
    getShellPath(Shell.Terminology),
  ])

  ...

  if (tilixPath) {
    shells.push({ shell: Shell.Tilix, path: tilixPath })
  }
}
```

### Step 2: Launch the shell

The `launch()` method will use the received `foundShell` executable path and
the path requested by the user. You will need to make changes here, to ensure
the correct arguments are passed to the command line interface:

```ts
export function launch(
  foundShell: FoundShell<Shell>,
  path: string
): ChildProcess {
  const shell = foundShell.shell
  switch (shell) {
    case Shell.Gnome:
    case Shell.Mate:
    case Shell.Tilix:
    case Shell.Terminator:
      return spawn(foundShell.path, ['--working-directory', path])
    case Shell.Urxvt:
      return spawn(foundShell.path, ['-cd', path])
    case Shell.Konsole:
      return spawn(foundShell.path, ['--workdir', path])
    case Shell.Xterm:
      return spawn(foundShell.path, ['-e', '/bin/bash'], { cwd: path })
    case Shell.Terminology:
      return spawn(foundShell.path, ['-d', path])
    default:
      return assertNever(shell, `Unknown shell: ${shell}`)
  }
}
```
