# Editor Integration

GitHub Desktop supports the user choosing an external program to open their
local repositories, and this is available from the main menu and right-clicking
on a repository in the sidebar.

The technical details around this list are outlined below, and differ slightly
based on the platform.

Currently Desktop supports these external editors:

 - [Atom](https://atom.io/)
 - [Visual Studio Code](https://code.visualstudio.com/)
 - [Sublime Text](https://www.sublimetext.com/)

These editors have been chosen because they are cross-platform and provide a
command line interface that other applications can interact with.

## Resolving External Editors

The strategies for finding and invoking external editors varies based on the
operating system.

### Windows

Windows programs are typically installed by the user. To assist with removal,
entries are added to the registry that help the operating system display
details about the program, so the operating system can remove it if necessary.
These entries are used by GitHub Desktop to identify relevant programs and
where they can be located.

The three common locations for programs to be installed:

 - `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information about 64-bit Windows software is found here

 - `HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information about 32-bit Windows software is found here

 - `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall` -
    uninstall information for software that doesn't require elevation (for
    example, it's installed under `%LOCALAPPDATA%`) is found here

When a program is installed onto a Windows OS, the registry key will contain a
number of key-value pairs - Desktop will enumerate these to ensure it's the
application it expects, and identify where the install location of the
application.

If it encounters the program it expects, it will confirm the shim (the
command-line program it can interact with) exists on disk. The location of the
shim is documented by each program.

### macOS

macOS programs are packaged as application bundles, and applications can
read information about each installed application.

The `CFBundleIdentifier` value in the plist is what applications use to
uniquely identify themselves, for example ``. AppKit provides the
[`absolutePathForAppBundleWithIdentifier`](https://developer.apple.com/documentation/appkit/nsworkspace/1533086-absolutepathforappbundlewithiden?language=objc)
API for searching for an application bundle.

If it finds an application bundle, it will return the path to the application
on the file system. With that information, Desktop can resolve the shim (the
command-line program it can interact with) and confirm it exists on disk.
