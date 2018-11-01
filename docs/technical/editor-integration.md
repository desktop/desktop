# "Open External Editor" integration

GitHub Desktop supports the user choosing an external program to open their
local repositories, and this is available from the top-level **Repository** menu
or when right-clicking on a repository in the sidebar.

### My favourite editor XYZ isn't supported!

This is the checklist of things that it needs to support:

 - the editor supports opening a directory, not just a file
 - the editor is installed by the user, so there is a reliable way to find it
   on the user's machine
 - it comes with a command-line interface that can be launched by Desktop

If you think your editor satisfies all these please read on to understand how
Desktop integrates with each OS, and if you're still keen to integrate this
please fork and contribute a pull request for the team to review.

## Windows

The source for the editor integration on Windows is found in
[`app/src/lib/editors/win32.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/win32.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/) - both stable and Insiders channel
 - [Sublime Text](https://www.sublimetext.com/)
 - [ColdFusion Builder](https://www.adobe.com/products/coldfusion-builder.html)
 - [Typora](https://typora.io/)
 - [SlickEdit](https://www.slickedit.com)

These are defined in an enum at the top of the file:

```ts
export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  CFBuilder = 'ColdFusion Builder',
  Typora = 'Typora',
  SlickEdit = 'SlickEdit',
}
```

If you want to add another editor, add a new key to the `ExternalEditor`
enum with a friendly name for the value. This will trigger a number of compiler
errors, which are places in the module you need to add code.

The steps for resolving each editor can be found in `findApplication()` and in
pseudocode looks like this:

```ts
async function findApplication(editor: ExternalEditor): Promise<string | null> {
  // find install location in registry
  // validate installation
  // find executable to launch
}
```

### Step 1: Find the Install Location

Windows programs are typically installed by the user. Installers will add
entries to the registry to help the OS with cleaning up later, if the user
wishes to uninstall. These entries are used by GitHub Desktop to identify
relevant programs and where they can be located.

The registry locations for each editor are listed in `getRegistryKeys()`.
Some editors support multiple install locations, but are structurally the
same (for example 64-bit or 32-bit application, or stable and developer
channels).

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


Your editor is probably hiding behind a GUID in one of these locations - this
is the key that Desktop needs to read the registry and find the installation for your editor.

### Step 2: Validate The Installation

As part of installing to the registry, a program will insert a
number of key-value pairs - Desktop will enumerate these to ensure it's the
application it expects, and identify where the install location of the
application.

There's two steps to this process. The first step is reading the registry, and
you can see this code in `extractApplicationInformation()`:

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

If you launch `regedit` and browse to the key associated with your editor, you
should see a list like this in the right-hand pane:

![](https://user-images.githubusercontent.com/359239/31530323-696543d8-b02b-11e7-9421-3fad76230bea.png)

Desktop needs enough information to validate the installation - usually
something related to the name of the program, and the identity of the
publisher - along with the install location on disk.

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
        displayName.startsWith('Microsoft Visual Studio Code') &&
        publisher === 'Microsoft Corporation'
      )
    ...
  }
}
```

### Step 3: Launch the program

Now that Desktop knows the program is the one it expects, it can use the
install location to then find the executable to launch. Many editors provide a
shim or standalone tool to manage this, rather than launching the
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

Desktop will confirm this file exists on disk before launching - if it's
missing or lost it won't let you launch the external editor.

## macOS

The source for the editor integration on macOS is found in
[`app/src/lib/editors/darwin.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/darwin.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [MacVim](https://macvim-dev.github.io/macvim/)
 - [Visual Studio Code](https://code.visualstudio.com/) - both stable and Insiders channel
 - [Sublime Text](https://www.sublimetext.com/)
 - [BBEdit](http://www.barebones.com/products/bbedit/)
 - [PhpStorm](https://www.jetbrains.com/phpstorm/)
 - [RubyMine](https://www.jetbrains.com/rubymine/)
 - [TextMate](https://macromates.com)
 - [Brackets](http://brackets.io/)
     - To use Brackets the Command Line shortcut must be installed.
       - This can be done by opening Brackets, choosing File > Install Command Line Shortcut
 - [WebStorm](https://www.jetbrains.com/webstorm/)
 - [Typora](https://typora.io/)
 - [SlickEdit](https://www.slickedit.com)

These are defined in an enum at the top of the file:

```ts

export enum ExternalEditor {
  Atom = 'Atom',
  MacVim = 'MacVim',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  BBEdit = 'BBEdit',
  PhpStorm = 'PhpStorm',
  RubyMine = 'RubyMine',
  TextMate = 'TextMate',
  Brackets = 'Brackets',
  WebStorm = 'WebStorm',
  Typora = 'Typora',
  SlickEdit = 'SlickEdit',
}
```

If you want to add another editor, add a new key to the `ExternalEditor`
enum with a friendly name for the value. This will trigger a number of compiler
errors, which are places in the module you need to add code.

The steps for resolving each editor can be found in `findApplication()` and in
pseudocode looks like this:

```ts
async function findApplication(editor: ExternalEditor): Promise<string | null> {
  // find path to installation
  // find executable to launch
}
```

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

AppKit provides an [`API`](https://developer.apple.com/documentation/appkit/nsworkspace/1533086-absolutepathforappbundlewithiden?language=objc)
for searching for an application bundle. If it finds an application bundle,
it will return the path to the application on disk. Otherwise it will raise an
exception.

### Step 2: Find executable to launch

With that information, Desktop can resolve the executable and confirm it exists
on disk before launching.

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


The source for the editor integration on Linux is found in
[`app/src/lib/editors/linux.ts`](https://github.com/desktop/desktop/blob/master/app/src/lib/editors/linux.ts).

These editors are currently supported:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/) - both stable and Insiders channel
 - [Sublime Text](https://www.sublimetext.com/)
 - [Typora](https://typora.io/)
 - [SlickEdit](https://www.slickedit.com)

These are defined in an enum at the top of the file:

```ts
export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  Typora = 'Typora',
  SlickEdit = 'SlickEdit',
}
```

If you want to add another editor, add a new key to the `ExternalEditor`
enum with a friendly name for the value. This will trigger a compiler
error, and you need to add code to `getEditorPath()` to get the source
building again.

### Step 1: Find executable path

The `getEditorPath()` maps the editor enum to an expected path to the
editor executable. Add a new `case` statement for your editor.

```ts
case ExternalEditor.VisualStudioCode:
  return getPathIfAvailable('/usr/bin/code')
```
### Step 2: Lookup executable

Once you've done that, add code to `getAvailableEditors()` so that it checks
for your new editor, following the existing patterns.

```ts
export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [atomPath, codePath, sublimePath] = await Promise.all([
    getEditorPath(ExternalEditor.Atom),
    getEditorPath(ExternalEditor.VisualStudioCode),
    getEditorPath(ExternalEditor.SublimeText),
    getEditorPath(ExternalEditor.Typora),
  ])

  ...

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  ...
}
```
