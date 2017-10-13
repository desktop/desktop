# Editor Integration

GitHub Desktop supports the user choosing an external program to open their
local repositories, and this is available from the main menu and right-clicking
on a repository in the sidebar.

### My favourite editor XYZ isn't listed here!

This is the checklist of things that it needs to support:

 - it supports opening a directory, not just a file
 - it is installed by the user, so there is a reliable way to find it on the user's machine
 - it comes with a command-line interface that can be launched

If you think it satifies all these, read on to understand how Desktop
integrates, and if you're still keen to integrate this please fork and
contribute a PR.

## Windows

The source for the editor integration on Windows is found in
[`app/src/lib/editors/win32.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/win32.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/)
 - [Sublime Text](https://www.sublimetext.com/)

They're registered in an enum near the top of the file:

```ts
export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  SublimeText = 'Sublime Text',
}
```

The code for resolving each editor can be found in `findApplication()` and in
pseudocode looks like this:

```ts
async function findApplication(editor: ExternalEditor): Promise<LookupResult> {
  // find install location in registry
  // validate installation
  // find executable to launch
}
```

### Step 1: Find the Install Location

Windows programs are typically installed by the user. To assist with removal,
entries are added to the registry that help the operating system display
details about the program, so the user can can tidy it up later if necessary.
These entries are used by GitHub Desktop to identify relevant programs and
where they can be located.

The location for each editor is listed in `getRegistryKeys()`. Some editors
support different install locations, but are structurally the same (for
example 64-bit or 32-bit installations, or stable and developer channels).

```ts
function getRegistryKeys(editor: ExternalEditor): ReadonlyArray<string> {
  switch (editor) {
    ...
    case ExternalEditor.VisualStudioCode:
      return [
        // 64-bit version of VSCode
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA457B21-F73E-494C-ACAB-524FDE069978}_is1',
        // 32-bit version of VSCode
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{F8A2A208-72B3-4D61-95FC-8A65D340689B}_is1',
      ]
    ...
  }
}
```

If you're not sure how your editor is installed, check one of these locations:

 - `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information about 64-bit Windows software is found here

 - `HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information about 32-bit Windows software is found here

 - `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information for software that doesn't require administrator
    permissions is found here


It's probably hiding behind a GUID in one of these locations - this is the the key that Desktop needs to read the registry and find the installation for your editor.

### Step 2: Validate The Installation

As part of installing to the registry, a program will insert a
number of key-value pairs - Desktop will enumerate these to ensure it's the
application it expects, and identify where the install location of the
application.

There's two steps to this. The first step is reading the registry, and you can
find this code in `extractApplicationInformation()`:

```ts
function extractApplicationInformation(
  editor: ExternalEditor,
  keys: ReadonlyArray<IRegistryEntry>
): { displayName: string; publisher: string; installLocation: string } {
  let displayName = ''
  let publisher = ''
  let installLocation = ''

  ...

  if (
    editor === ExternalEditor.VisualStudioCode ||
    editor === ExternalEditor.SublimeText
  ) {
    for (const item of keys) {
      if (item.name === 'Inno Setup: Icon Group') {
        displayName = item.value
      } else if (item.name === 'Publisher') {
        publisher = item.value
      } else if (item.name === 'Inno Setup: App Path') {
        installLocation = item.value
      }
    }

    return { displayName, publisher, installLocation }
  }

  ...
}
```

If you launch `regedit` and browse to the registry entry for your editor, you
should see a view like this:

![](https://user-images.githubusercontent.com/359239/31530323-696543d8-b02b-11e7-9421-3fad76230bea.png)

We need enough information to validate the installation, usually something
related to the name of the editor, and the identity of the author, along
with the install location of the program.

The second step is to validate the installation, and this is done in
`isExpectedInstallation()`:

```ts
function isExpectedInstallation(
  editor: ExternalEditor,
  displayName: string,
  publisher: string
): boolean {
  switch (editor) {
    ...
    case ExternalEditor.VisualStudioCode:
      return (
        displayName === 'Visual Studio Code' &&
        publisher === 'Microsoft Corporation'
      )
    ...
  }
}
```

### Step 3: Launch the program

Now that Desktop knows the program is the one it expects, it can use the
install location to then find the executable to launch. Many editors provide a
shim, or a standalone tool, to manage this, rather than launching the
executable directly. Whatever options there are, this should be a known
location with an interface that doesn't change between updates.

```ts
function getExecutableShim(
  editor: ExternalEditor,
  installLocation: string
): string {
  switch (editor) {
    ...
    case ExternalEditor.VisualStudioCode:
      return Path.join(installLocation, 'bin', 'code.cmd')
    ...
  }
}
```

Desktop will confirm this file exists on disk - if it's missing or lost
it won't let you launch the external editor.


## macOS

The source for the editor integration on macOS is found in
[`app/src/lib/editors/darwin.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/darwin.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/)
 - [Sublime Text](https://www.sublimetext.com/)

They're registered in an enum near the top of the file:

macOS programs are packaged as application bundles, and applications can
read information about each installed application.

The `CFBundleIdentifier` value in the plist is what applications use to
uniquely identify themselves, for example `com.github.GitHubClient` is the
identifier for GitHub Desktop. AppKit provides the
[`absolutePathForAppBundleWithIdentifier`](https://developer.apple.com/documentation/appkit/nsworkspace/1533086-absolutepathforappbundlewithiden?language=objc)
API for searching for an application bundle.

If it finds an application bundle, it will return the path to the application
on the file system. With that information, Desktop can resolve the shim (the
command-line program it can interact with) and confirm it exists on disk.

## Linux

This integration isn't quite ready yet. If you're interested in this, and have
experience with this, feel free to start hacking on the stuff under