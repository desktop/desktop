### Download Desktop
  - [ ] User can download latest (Mac & Windows) Desktop from https://desktop.github.com/    
    - [ ] Mac: https://central.github.com/mac/latest 
      - [ ] Windows: https://github-windows.s3.amazonaws.com/GitHubSetup.exe
  - [ ] Release notes page is up-to-date
  - [ ] Help page is accessible

### Welcome Flow
  - [ ] Create your account (/join?source=github-desktop)
    - [ ] User is not automatically logged into Desktop post creation
  - [ ] Sign in to Github.com 
    - [ ] `Sign in` successful if valid username/email and password
		  - [ ] If 2FA activated, user sent auth code to enter 
			  - [ ] Sign in successful with active code, user goes to Configure Git
			  - [ ] Error message if code is wrong or inactive 
  		- [ ] Error message if incorrect username/email or password
    - [ ] Forgot link (/password_reset)
    - [ ] `Cancel` returns to initial Welcome Flow
    - [ ] `Sign in using your browser` opens default browser
  		- [ ] Browser login, Authorize GitHub Desktop, “accept” link
  - [ ] Sign in to Enterprise (v2.8 and up)
    - [ ] `Continue` successful if server address is valid, else error message
  		- [ ] `Sign in using your browser` opens default browser
  - [ ] Browser login, [insert custom security measure], Authorize GitHub Desktop, “accept” link
    - [ ] User goes to Configure Git if successful
  - [ ] `Cancel` returns to initial Welcome Flow
    - [ ] `Cancel` returns to initial Welcome Flow
    - [ ] User served generic message if not authorized to access Enterprise server
  - [ ] Skip step
    - [ ] Configure Git
  		- [ ] Name and email pulled from global `.gitconfig` file, if configured
  			- [ ] If recognized, avatar is present
  		- [ ] `Continue` okay if fields populated or blank
  			- [ ] Valid login credentials from dotcom or Enterprise carried through 
  - [ ] Usage Data
   - [ ] Checked by default; user can uncheck
	  	- [ ] Clicking `Finish`, and user is signed in successfully to Desktop
   - [ ] `Cancel` returns to initial Configure Git page

### Repositories landing page; default no repositories 
  - [ ] Create New Repository (Mac: ⌘N; Windows: Ctrl+N)
    - [ ] Modal opens with name, path (choose option), readme (unchecked), git ignore, license. Name and path mandatory.
    - [ ] `Create Repository` button adds new repo, which is added to Repo list
    - [ ] `Cancel` button does not save any changes made; modal closed
  - [ ] Clone a Repository (Mac: ⇧⌘O; Windows: Ctrl+Shift+O)
    - [ ] Enter valid URL or username/repo, else error message
    - [ ] Valid path can be entered or selected, else error message
    - [ ] `Clone` creates repo at selected path
  		- [ ] Repo added to Repo list
    - [ ] `Cancel` closes modal, no repo cloned
  - [ ] Add a Local Repository (Mac: ⌘O; Windows: Ctrl+O)
    - [ ] Valid path can be entered or selected
    - [ ] `Add repository` activated if repo path exists
  		- [ ] Repo added to Repo list
    - [ ] `Cancel` closes modal, no repo added
  - [ ] Drag and drop repository
    - [ ] User can drag existing local repository into Desktop
  		- [ ] Successful attempt adds repo to Repo list; else error message

### Application
  - [ ] Minimize, Maximize, Close buttons work in top nav
  - [ ] Double-clicking local desktop icon opens the application
  - [ ] Double clicking top nav bar toggles full-screen / last used screen-size

### GitHub Desktop menu
  - [ ] About GitHub Desktop
    - [ ] Current version shown
    - [ ]  Links to release notes, terms, licenses
    - [ ] Clicking `Check for updates` button timestamps last attempt
  		- [ ] If update available, `Install Update` button will quit app and install update
  		- [ ] If update available, download banner is present in main window with `restart` and `what’s new` links
  		- [ ] If checking for update or download latest update, the `Check for updates` button is disabled
    - [ ] `Close` button closes modal 
  - [ ] Preferences (Mac: ⌘,)
    - [ ] Accounts
  		- [ ] GitHub.com name, handle, avatar, `sign out` button, if user signed in
  		- [ ] Enterprise handle, avatar,  `sign out` button, if user signed in
  		- [ ] User can sign out of either account
    - [ ] Git
	  	- [ ] Username and email are displayed if `.gitconfig` configured for Welcome flow
	  	- [ ] `Save` button saves any changes made
	  	- [ ] `Cancel` button does not save any changes made; modal closed
   - [ ] Advanced
  		- [ ] Usage data selection carried through from Welcome flow; user can change
  		- [ ] Repository close option is checked by default; user can change
  		- [ ] `Save` button saves any changes made
  		- [ ] `Cancel` button does not save any changes made; modal closed
  - [ ] Install command line tool installs tool at `/usr/local/bin/github` (ok to install again)
    - [ ] Clicking `OK` closes modal
  - [ ] Quit Desktop (⌘Q)
    - [ ] Quitting and reopening Desktop returns you to last visited repo

### File menu
  - [ ] Create New Repository (Mac: ⌘N; Windows: Ctrl+N)
  - [ ] Clone a Repository (Mac: ⇧⌘O; Windows: Ctrl+Shift+O)
  - [ ] Add a Local Repository (Mac: ⌘O; Windows: Ctrl+O)
  - [ ] Options... (Windows only: Ctrl+,)

### Edit menu 
  - [ ] Undo (Mac: ⌘Z; Windows: Ctrl+Z)
  - [ ] Redo (Mac: ⇧⌘Z; Windows: Ctrl+Y)
  - [ ] Cut (Mac: ⌘X; Windows: Ctrl+X)
  - [ ] Copy (Mac: ⌘C; Windows: Ctrl+C)
  - [ ] Paste (Mac: ⌘V; Windows: Ctrl+V)
  - [ ] Select all (Mac: ⌘A; Windows: Ctrl+A)

### View menu
  - [ ] Show Changes (Mac: ⌘1; Windows: Ctrl+1)
  - [ ] Show History (Mac: ⌘2; Windows: Ctrl+2)
  - [ ] Show Repositories List (Mac: ⌘T; Windows: Ctrl+T)
  - [ ] Show Branches List (Mac: ⌘B; Windows: Ctrl+B)
  - [ ] Enter Full Zoom (Mac: ^⌘F; Windows: F11)
  - [ ] Reset Zoom (Mac: ⌘0; Windows: Ctrl+0)
  - [ ] Zoom In (Mac: ⌘=; Windows: Ctrl+=)
  - [ ] Zoom Out (Mac: ⌘-; Windows: Ctrl+-)
  - [ ] Toggle Developer Tools (Mac: ⌥⌘I; Windows: Ctrl+Shift+I)

### Repository menu. (Only enabled if one repo present)
  - [ ] Push (Mac: ⌘P; Windows: Ctrl+P)
    - [ ] Commits from repo pushed to .com; error message shown if conflicts
  - [ ] Pull (Mac: ⇧⌘P; Windows: Ctrl+Shirt+P)
    - [ ] Commits from repo pulled from .com; error message shown if conflicts
  - [ ] Remove
    - [ ] Repo is removed from Repo List; confirmation option if enabled
  - [ ] View on GitHub (Mac: ⌥⌘G; Windows: Ctrl+Alt+G)
    - [ ] Repo on .com is opened; must be logged in if private repo or Enterprise
  - [ ] Open in Terminal
    - [ ] Local repo is opened
  - [ ] Show in Finder/Explorer (Mac: ⇧⌘F; Windows: Ctrl+Shift+F)
    - [ ] Local repo is opened
  - [ ] Repository settings
    - [ ] Remote path can be edited; origin already set
  		- [ ] `Saved` button saves last entry
  		- [ ] `Cancel` button closes modal
    - [ ] Ignored Files
  		- [ ] `.gitignore` file contents are shown and can be edited
	  		- [ ] `Saved` button saves last entry; changes create a new commit
	  		- [ ] `Cancel` button closes modal

### Branch menu
  - [ ] New Branch (Mac: ⇧⌘N; Windows: Ctrl+Shift+N)
    - [ ] Clicking `Create Branch` makes new branch based on the entered name, if not a duplicate
    - [ ] Master branch is mentioned in the list
    - [ ] `Cancel` button closes modal
  - [ ] Rename (cannot be master)
    - [ ] `Rename` button changes branch name if field updated
    - [ ] `Cancel` button closes modal
  - [ ] Delete (cannot be master)
    - [ ] `Delete` button deletes branch name
    - [ ] `Cancel` button closes modal
  - [ ] Update from Default Branch (cannot be master)
  - [ ] Merge into Current Branch
    - [ ] Use can filter existing branches
    - [ ] User can select branch, other than current
    - [ ] `Merge` button only activated if something to merge
    - [ ] `Cancel` button closes modal
  - [ ] Compare on GitHub (Mac: ⇧⌘C; Windows: Ctrl+Shift+C) (if repo already published on .com)
  - [ ] Create Pull request (Mac: ⇧⌘P; Windows: Ctrl+Shift+P -- both cmds to change) opens Pull Request on .com 

### Help menu
  - [ ] `Report Issue` opens issue template in Desktop repo on github.com
  - [ ] `User Guides` opens Desktop help page on github.com
  - [ ] `Show Logs` opens Finder/Explorer logs on local
    - [ ] Mac: `ls ~/Library/Application\ Support/GitHub\ Desktop/*.log`
    - [ ] Windows: `%LOCALAPPDATA%\\Desktop\\*.desktop.production.log`
  - [ ] About GitHub Desktop (Windows only)

### Repositories List
  - [ ] Current repo is always shown in top slot with respective icon; if repo exists
  - [ ] Opening list shows all repos in categorized format with a working filter
    - [ ] `ESC` clears the filter
    - [ ] All repos (private, enterprise, local, public, forked) have proper icon and found in the proper category (GitHub.com/Enterprise/Other)
  		- [ ] User must have paid account for private repos
  - [ ] Repositories cloned from non-github servers should always be in the Other group, and have the 'computer' icon.
  - [ ] Selecting a repo updates Changes/History/Diff areas
  		- [ ] If no Changes, Diff area shows `Open this repository` link to Finder/Explorer on local
  - [ ] `Right-click` on any repo shows `Open in Terminal`, `Open in Finder/Explorer` and `Remove` options
  - [ ] Repos which have been removed locally (and trash emptied) have 'cannot find repository' warning
    - [ ] Relaunching the app when it displays a missing repository preserves the repo's name and last seen path
    - [ ] Remove a repo which can not be found (deleted locally & trash emptied)
  - [ ] Repos which are cloning display a progress bar

### Changes
  - [ ] Any changed files appear in the list, with respective +/•/- sign; with arrow keys enabled
    - [ ] User can check none, or check one or more files to commit; list is scrollable
  		- [ ] User can select one or more lines to commit; diff is scrollable
  - [ ] Panes can be resized horizontally, and contents resize to take the full width
    - [ ] Quitting Desktop and relaunching remembers sizes

### History
  - [ ] All commits listed in chronological order, with avatar, date and name; list is scrollable with arrow keys enabled

### Diffs		
  - [ ] All commits have link to GitHub, SHA, # of files changed, avatar, commit message, commit description (optional)
  - [ ] All files within a commit listed, with respective +/•/- sign; list is scrollable
    - [ ] Diffs are viewable; list is scrollable with arrow keys enabled
  		- [ ] Green is for additions, red for deletions
  		- [ ] Different file types are rendered properly
  - [ ] Panes can be resized horizontally, and contents resize to take the full width

### Commit
  - [ ] Commit created if user clicks `Commit to X` button with commit message and at least one checked file
    - [ ] `Fetch origin` changes to `Push` with number of commits badge
  - [ ] Avatar of user is shown
  - [ ] Description field is optional
  - [ ] User can undo last commit
    - [ ] `Push` with number of commits badge is decremented or reverts to `Fetch origin`
  - [ ] `Undo` button disabled if user is pushing commit

### Branches
  - [ ] Current branch always shows if repository present
  - [ ] Opening list shows all branches in categorized format with a working filter
    - [ ] ESC clears the filter
  - [ ] Default branch labeled and listed first, with timestamp
  - [ ] Selecting a branch switches branches
  - [ ] Creating a new branch shows `Publish branch` button
    - [ ] Publishing successful if logged in only; else error message
  		- [ ] `Create Pull Request` menu option shows warning if branch not published yet
  - [ ] Renamed branches updated on .com and vice-versa
    - [ ] Opens modal with ability to enter new name
  - [ ] Deleted branches updated on .com and vice-versa
    - [ ] Deleting branch show warning message

### Fetching origin/Pull
  - [ ] Code is constantly being fetched from .com with timestamp
    - [ ] If Pull Requests on .com, they are reflected with down arrow and quantity
    - [ ] Pull Requests and Commits can co-exist; error surfaces if merge commit
  - [ ] User cannot Push/Pull without being signed in; error message surfaced
    - [ ] Push/Pull works with public/private/Enterprise repos
  - [ ] When a branch is local-only make sure that the `Sync` button changes to `Publish` and it publishes

### Windows-specific Tests (TBD)

