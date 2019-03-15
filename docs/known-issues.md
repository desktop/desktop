# Known Issues

This document outlines acknowledged issues with GitHub Desktop, including workarounds if known.

## What should I do if...

### I have encountered an issue listed here?

Some known issues have a workaround that users have reported addresses the issue. Please try the workaround for yourself to confirm it addresses the issue.

### I have additional questions about an issue listed here?

Each known issue links off to an existing GitHub issue. If you have additional questions or feedback, please comment on the issue.

### My issue is not listed here?

Please check the [open](https://github.com/desktop/desktop/labels/bug) and [closed](https://github.com/desktop/desktop/issues?q=is%3Aclosed+label%3Abug) bugs in the issue tracker for the details of your bug. If you can't find it, or if you're not sure, open a [new issue](https://github.com/desktop/desktop/issues/new?template=bug_report.md).

## macOS

### 'The username or passphrase you entered is not correct' error after signing into account - [#3263](https://github.com/desktop/desktop/issues/3263)

This seems to be caused by the Keychain being in an invalid state, affecting applications that try to use the keychain to store or retrieve credentials. Seems to be specific to macOS High Sierra (10.13).

**Workaround:**

- Open `Keychain Access.app`
- Right-click on the `login` keychain and try locking it
- Right-click on the `login` keychain and try unlocking it
- Sign into your GitHub account again

### Checking for updates triggers a 'Could not create temporary directory: Permission denied' message - [#4115](https://github.com/desktop/desktop/issues/4115)

This issue seems to be caused by missing permissions for the `~/Library/Caches/com.github.GitHubClient.ShipIt` folder. This is a directory that Desktop uses to create and unpack temporary files as part of updating the application.

**Workaround:**

 - Close Desktop
 - Open Finder and navigate to `~/Library/Caches/`
 - Context-click `com.github.GitHubClient.ShipIt` and select **Get Info**
 - Expand the **Sharing & Permissions** section
 - If you do not see the "You can read and write" message, add yourself with
   the "Read & Write" permissions
 - Start Desktop again and check for updates

## Windows

### Window is hidden after detaching secondary monitor - [#2107](https://github.com/desktop/desktop/issues/2107)

This is related to Desktop tracking the window position between launches, but not changes to your display configuration such as removing the secondary monitor where Desktop was positioned.

**Workaround:**

 - Remove `%APPDATA%\GitHub Desktop\window-state.json`
 - Restart Desktop

### Certificate revocation check fails - [#3326](https://github.com/desktop/desktop/issues/3326)

If you are using Desktop on a corporate network, you may encounter an error like this:

```
fatal: unable to access 'https://github.com/owner/name.git/': schannel: next InitializeSecurityContext failed: Unknown error (0x80092012) - The revocation function was unable to check revocation for the certificate.
```

GitHub Desktop by default uses the Windows Secure Channel (SChannel) APIs to validate the certificate received from a server. Some networks will block the attempts by Windows to check the revocation status of a certificate, which then causes the whole operation to error.

**Workaround:**

**We do not recommend setting this config value for normal Git usage**. This is intended to be an "escape hatch" for situations where the network administrator has restricted the normal usage of SChannel APIs on Windows that Git is trying to use.

Run this command in your Git shell to disable the revocation check:

```shellsession
$ git config --global http.schannelCheckRevoke false
```

### Using a repository configured with Folder Redirection - [#2972](https://github.com/desktop/desktop/issues/2972)

[Folder Redirection](https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/cc753996(v%3dws.11)) is an feature of Windows for administrators to ensure files and folders are managed on a network server, instead.

**Not supported** as Git is not able to resolve the working directory correctly:

```shellsession
2017-09-21T23:16:05.933Z - error: [ui] `git -c credential.helper= lfs clone --recursive --progress --progress -- https://github.com/owner/name.git \\harvest\Redirected\andrewd\My Documents\GitHub\name` exited with an unexpected code: 2.
Cloning into '\\harvest\Redirected\andrewd\My Documents\GitHub\name'...
remote: Counting objects: 4, done.
remote: Compressing objects:  33% (1/3)
remote: Compressing objects:  66% (2/3)
remote: Compressing objects: 100% (3/3)
remote: Compressing objects: 100% (3/3), done.
remote: Total 4 (delta 1), reused 4 (delta 1), pack-reused 0
fatal: unable to get current working directory: No such file or directory
warning: Clone succeeded, but checkout failed.
You can inspect what was checked out with 'git status'
and retry the checkout with 'git checkout -f HEAD'

Error(s) during clone:
git clone failed: exit status 128
```

### Enable Mandatory ASLR triggers cygheap errors - [#3096](https://github.com/desktop/desktop/issues/3096)

Windows 10 Fall Creators Edition (version 1709 or later) added enhancements to the Enhanced Mitigation Experience Toolkit, one being to enable Mandatory ASLR. This setting affects the embedded Git shipped in Desktop, and produces errors that look like this:

```
      1 [main] sh (2072) C:\Users\bdorrans\AppData\Local\GitHubDesktop\app-1.0.4\resources\app\git\usr\bin\sh.exe: *** fatal error - cygheap base mismatch detected - 0x2E07408/0x2EC7408.
This problem is probably due to using incompatible versions of the cygwin DLL.
Search for cygwin1.dll using the Windows Start->Find/Search facility
and delete all but the most recent version.  The most recent version *should*
reside in x:\cygwin\bin, where 'x' is the drive on which you have
installed the cygwin distribution.  Rebooting is also suggested if you
are unable to find another cygwin DLL.
```

Enabling Mandatory ASLR affects the MSYS2 core library, which is relied upon by Git for Windows to emulate process forking.

**Not supported:** this is an upstream limitation of MSYS2, and it is recommend that you either disable Mandatory ASLR or whitelist all executables under `<Git>\usr\bin` which depend on MSYS2.

### I get a black screen when launching Desktop

Electron enables hardware accelerated graphics by default, but some graphics cards have issues with hardware acceleration which means the application will launch successfully but it will be a black screen.

**Workaround:** if you set the `GITHUB_DESKTOP_DISABLE_HARDWARE_ACCELERATION` environment variable to any value and launch Desktop again it will disable hardware acceleration on launch, so the application is usable.

### Failed to open CA file after an update - [#4832](https://github.com/desktop/desktop/issues/4832)

A recent upgrade to Git for Windows changed how it uses `http.sslCAInfo`.

An example of this error:

> fatal: unable to access 'https://github.com/\<owner>/\<repo>.git/': schannel: failed to open CA file 'C:/Users/\<account>/AppData/Local/GitHubDesktop/app-1.2.2/resources/app/git/mingw64/bin/curl-ca-bundle.crt': No such file or directory

This is occuring because some users have an existing Git for Windows installation that created a special config at `C:\ProgramData\Git\config`, and this config may contain a `http.sslCAInfo` entry, which is inherited by Desktop.

There's two problems with this current state:

 - Desktop doesn't need custom certificates for it's Git operations - it uses SChannel by default, which uses the Windows Certificate Store to verify server certificates
 - this `http.sslCAInfo` config value may resolve to a location or file that doesn't exist in Desktop's Git installation

**Workaround:**

1. Verify that you have the problem configuration by checking the output of this command:

```
> git config -l --show-origin
```

You should have an entry that looks like this:

```
file:"C:\ProgramData/Git/config" http.sslcainfo=[some value here]
```

2. Open `C:\ProgramData\Git\config` (requires elevated privileges) and remove the corresponding lines that look like this:

```
[http]
sslCAInfo = [some value here]
```

### Ask-Pass-Trampoline.bat errors - [#2623](https://github.com/desktop/desktop/issues/2623), [#4124](https://github.com/desktop/desktop/issues/4124), [#6882](https://github.com/desktop/desktop/issues/6882), [#6789](https://github.com/desktop/desktop/issues/6879)

An example of the error message:

```
The system cannot find the path specified.
error: unable to read askpass response from 'C:\Users\User\AppData\Local\GitHubDesktop\app-1.6.2\resources\app\static\ask-pass-trampoline.bat'
fatal: could not read Username for 'https://github.com': terminal prompts disabled"
```

Known causes and workarounds:

-  Modifying the `AutoRun` registry entry. To check if this entry has been modified open `Regedit.exe` and navigate to `HKEY_CURRENT_USER\Software\Microsoft\Command Processor\autorun` to see if there is anything set (sometimes applications will also modify this). See [#6789](https://github.com/desktop/desktop/issues/6879#issuecomment-471042891) and [2623](https://github.com/desktop/desktop/issues/2623#issuecomment-334305916) for examples of this.

- Special characters in your Windows username like a `&` or `-` can cause this error to be thrown. See [#7064](https://github.com/desktop/desktop/issues/7064) for an example of this. Try installing GitHub Desktop in a new user account to verify if this is the case.

- Antivirus software can sometimes prevent GitHub Desktop from installing correctly. If you are running antivirus software that could be causing this try temporarily disabling it and reinstalling GitHub Desktop.

- If none of these potential causes are present on your machine, try performing a fresh installation of GitHub Desktop to see if that gets things working again. Here are the steps you can take to do that:

  1. Close GitHub Desktop
  2. Delete the `%AppData%\GitHub Desktop\` directory
  3. Delete the `%LocalAppData%\GitHubDesktop\` directory
  3. Reinstall GitHub Desktop from http://desktop.github.com