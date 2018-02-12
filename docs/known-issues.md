# Known Issues

This document outlines acknowledged issues with GitHub Desktop, including workarounds if known.

## What should I do if...

### I have encountered an issue listed here?

Some known issues have a workaround that users have reported addresses the issue. Please try the workaround for yourself to confirm it addresses the issue.

### I have additional questions about an issue listed here?

Each known issue links off to an existing GitHub issue. If you have additional questions or feedback, please comment on the issue.

### My issue is not listed here? 

Please check the [open](https://github.com/desktop/desktop/labels/bug) and [closed](https://github.com/desktop/desktop/issues?q=is%3Aclosed+label%3Abug) bugs in the issue tracker for the details of your bug. If you can't find it, or if you're not sure, open a [new issue](https://github.com/desktop/desktop/issues/new).

## macOS

### 'The username or passphrase you entered is not correct' error after signing into account - [#3263](https://github.com/desktop/desktop/issues/3263)

This seems to be caused by the Keychain being in an invalid state, affecting applications that try to use the keychain to store or retrieve credentials. Seems to be specific to macOS High Sierra (10.13).

**Workaround:** 

- Open `Keychain Access.app`
- Right-click on the `login` keychain and try locking it
- Right-click on the `login` keychain and try unlocking it
- Sign into your GitHub account again

## Windows
 
### Window is hidden after detaching secondary monitor - [#2107](https://github.com/desktop/desktop/issues/2107)

This is related to Desktop tracking the window position between launches, but not changes to your display configuration such as removing the secondary monitor where Desktop was positioned.

**Workaround:** 

 - Remove `%APPDATA%\GitHub Desktop\window-state.json` 
 - Restart Desktop

### Using a repository configured with Folder Redirection - [#2972](https://github.com/desktop/desktop/issues/2972)

[Folder Redirection](https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/cc753996(v%3dws.11)) is an feature of Windows for administrators to ensure files and folders are managed on a network server, instea.

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
