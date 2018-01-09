# Installing GitHub Desktop

GitHub Desktop currently supports Windows 7 (or higher) and macOS 10.9 (or higher).

### macOS

Download the `GitHub Desktop.zip`, unpack the application and put it wherever you want.

### Windows

On Windows you have two options:

 - Download the `GitHubDesktopSetup.exe` and run it to install it for the current user.
 - Download the `GitHubDesktopSetup.msi` and run it to install a machine-wide version of GitHub Desktop - each logged-in user will then be able to run GitHub Desktop from the program at `%PROGRAMFILES(x86)\GitHub Desktop Installer\desktop.exe`

## Data Directories

GitHub Desktop will create directories to manage the files and data it needs to function. If you manage a network of computers and want to install GitHub Desktop, here is more information about how things work.

### macOS
 - `~/Library/Application Support/GitHub Desktop/` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

### Windows

 - `%LOCALAPPDATA%\GitHubDesktop\` - contains the latest versions of the app, and some older versions if the user has updated from a previous version.
 - `%APPDATA%\GitHub Desktop\` - this directory contains user-specific data which the application requires to run, and is created on launch if it doesn't exist. Log files are also stored in this location.

## Log Files

GitHub Desktop will generate logs as part of its normal usage, to assist with troubleshooting. They are located in the data directory that GitHub Desktop uses (see above) under a `logs` subdirectory, organized by date using the format `YYYY-MM-DD.desktop.production.log`, where `YYYY-MM-DD` is the day the log was created.
