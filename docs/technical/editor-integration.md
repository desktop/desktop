# Editor Integration

GitHub Desktop supports the user choosing an external program to open their
local repositories, and this is available from the main menu and right-clicking
on a repository in the sidebar.

### My favourite editor XYZ isn't listed here!

This is the checklist of things that it needs to support:

 - it supports opening a directory, not just a file
 - it is installed by the user, so there is a reliable way to find it on the
   user's machine
 - it comes with a command-line interface that can be launched

If you think it satifies all these read on to understand how Desktop
integrates with each OS, and if you're still keen to integrate this please fork
and contribute a pull request for the team to review.

## Windows

The source for the editor integration on Windows is found in
[`app/src/lib/editors/win32.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/win32.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/)
 - [Sublime Text](https://www.sublimetext.com/)

These are defined in an enum at the top of the file:

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

If you want to add another editor, add a new key to the `ExternalEditor`
enum with a friendly name for the value. This will trigger a number of compiler
errors, which are places in the module you need to add code.

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

Desktop needs enough information to validate the installation, usually
something related to the name of the program, and the identity of the
publisher, along with the install location on disk.

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

These are defined in an enum at the top of the file:

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
  // find path to installation
  // find executable to launch
}
```

If you want to add another editor, add a new key to the `ExternalEditor`
enum with a friendly name for the value. This will trigger a number of compiler
errors, which are places in the module you need to add code.

### Step 1: Find installation path

macOS programs are packaged as application bundles, and applications can
read information from the OS to see if they are present.

The `CFBundleIdentifier` value in the plist is what applications use to
uniquely identify themselves, for example `com.github.GitHubClient` is the
identifier for GitHub Desktop.

The `getBundleIdentifier()` method is the lookup method for this value:

```ts
function getBundleIdentifier(editor: ExternalEditor): string {
  switch (editor) {
    ...
    case ExternalEditor.VisualStudioCode:
      return 'com.microsoft.VSCode'
    ...
  }
}
```

AppKit provides an [`absolutePathForAppBundleWithIdentifier`](https://developer.apple.com/documentation/appkit/nsworkspace/1533086-absolutepathforappbundlewithiden?language=objc)
API for searching for an application bundle. If it finds an application bundle,
it will return the path to the application on the file system. Otherwise it
will raise an exception.

### Step 2: Find executable to launch

With that information, Desktop can resolve the shim
(the command-line program it can interact with) and confirm it exists on disk.

This is done in the `getExecutableShim()` method:

```ts
function getExecutableShim(
  editor: ExternalEditor,
  installPath: string
): string {
  switch (editor) {
    ...
    case ExternalEditor.VisualStudioCode:
      return Path.join(
        installPath,
        'Contents',
        'Resources',
        'app',
        'bin',
        'code'
      )
    ...
  }
}
```

## Linux

This integration isn't quite ready yet. If you're interested in this, and have
experience with this, feel free to start hacking on the stuff under[`app/src/lib/editors/linux.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/linux.ts).

To test this in development mode, you'll need to update [`app/src/lib/editors/shared.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/shared.ts)
to use the Linux module:

```diff
 import * as Darwin from './darwin'
 import * as Win32 from './win32'
+import * as Linux from './linux'

-export type ExternalEditor = Darwin.ExternalEditor | Win32.ExternalEditor
+export type ExternalEditor =
+  | Darwin.ExternalEditor
+  | Win32.ExternalEditor
+  | Linux.ExternalEditor

 /** Parse the label into the specified shell type. */
 export function parse(label: string): ExternalEditor | null {
@@ -9,6 +13,8 @@ export function parse(label: string): ExternalEditor | null {
     return Darwin.parse(label)
   } else if (__WIN32__) {
     return Win32.parse(label)
+  } else if (__LINUX__) {
+    return Linux.parse(label)
   }
```

Then build and launch the app to test it out.