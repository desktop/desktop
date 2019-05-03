### Download Desktop
  - [ ] User can download latest (Mac & Windows) Desktop from https://desktop.github.com/    
    - [ ] Mac: https://central.github.com/deployments/desktop/desktop/latest/darwin
      - [ ] Homebrew package manager: `brew cask install github-desktop`
    - [ ] Windows: https://central.github.com/deployments/desktop/desktop/latest/win32
      - [ ] Chocolatey package manager: `choco install github-desktop`
      - [ ] 64-bit and up
    - [ ] Data is retained if you download and open a fresh copy
  - [ ] Release notes page is up-to-date in app and here https://desktop.github.com/release-notes/
  - [ ] Help page is accessible https://help.github.com/desktop/
  - [ ] 'Please update' notification shown in Classic apps

### Welcome Flow
  - [ ] Create your free account (`/join?source=github-desktop`)
    - [ ] User is not automatically logged into Desktop post account creation
  - [ ] `Sign in to Github.com` link
    - [ ] `Sign in` successful if valid username/email and password
      - [ ] If 2FA activated, user sent auth code to enter (test SMS and authenticator app)
        - [ ] User can reissue auth code with `Resend SMS` link
	- [ ] Sign in successful with active 2FA code, user goes to Configure Git page
	  - [ ] User sees Repository landing page if sign-in successful
	  - [ ] Error message if code is wrong or inactive 
      - [ ] Error message if incorrect username/email or password
    - [ ] Forgot link (`/password_reset`)
    - [ ] `Cancel` returns to initial Welcome Flow page
    - [ ] `Sign-in using your browser` opens default browser for confirmation
      - [ ] Browser login, "authorize" GitHub Desktop, “accept” link
        - [ ] If successful, Desktop shown in `/settings/applications` in user profile
  - [ ] `Sign in to Enterprise` link (v2.8 and up)
    - [ ] `Continue` successful if server address is valid, else error message
      - [ ] `Sign in using your browser` opens default browser for confirmation
        - [ ] Browser login, [insert custom security measure], Authorize GitHub Desktop, “accept” link
    - [ ] User goes to Configure Git if successful
    - [ ] `Cancel` returns to initial Welcome Flow
    - [ ] User served generic message if not authorized to access Enterprise server
  - [ ] Skip "username+password" step
    - [ ] Configure Git
      - [ ] Name and email pulled from global `.gitconfig` file, if configured
  	- [ ] If recognized, your avatar is present in example commit; gravatars not recognized
      - [ ] `Continue` allowed if fields populated or blank
  	- [ ] Valid login credentials from github.com or Enterprise carried through
	  - [ ] User sees Repository landing page if sign-in successful
  - [ ] Usage Data
    - [ ] Checked by default; user can uncheck. (Should not be checked by default if user on free plan only.)
      - [ ] Clicking `Finish`, results in user being signed-in successfully
    - [ ] `Cancel` returns to initial Configure Git page
    
### Onboarding (wip)

### Repositories landing page; default no repositories 
  - [ ] Create New Repository (Mac: `⌘N`; Windows: `Ctrl+N`)
    - [ ] Modal opens with name, path (choose option), readme (unchecked), git ignore, license. Name and path mandatory.
      - [ ] If `Add this repository` warning message appears, clicking it adds to Repo list
      - [ ] If repository name is over 100 characters, warning message is surfaced in modal
      - [ ] If repository contains URL-hostile characters, show error message
    - [ ] `Create Repository` button adds new repo, which is added to Repo list
    - [ ] `Cancel` button does not save any changes made; modal closed
    - [ ] User cannot create a new repo inside a locked local directory 
  - [ ] Clone a Repository (Mac: `⇧⌘O`; Windows: `Ctrl+Shift+O`)
    - [ ] Enter valid URL or `username/repo/gist`, else error message
      - [ ] If authentication error for Github.com, modal with username/password surfaced; `Cancel` or `Save and Retry` buttons
        - [ ] If successful, repo is cloned
	- [ ] Modal surfaces again if unsuccessful
      - [ ] If authentication error for Enterprise, user redirected to Preferences
    - [ ] Valid path can be entered or selected
      - [ ] Local path is prepopulated; if not unique then error surfaced
    - [ ] All repos from both GitHub.com and Enterprise are populated -- your repos are listed first, followed by org(s)
      - [ ] User must be logged in to view list; else `Sign In` button present
      - [ ] Results are filterable, and can be selected for cloning
    - [ ] `Clone` creates repo at selected path
      - [ ] Repo added to Repo list
    - [ ] `Cancel` closes modal, no repo cloned
  - [ ] Add a Local Repository (Mac: `⌘O`; Windows: `Ctrl+O`)
    - [ ] Valid path can be entered or selected
    - [ ] `Add repository` activated if repo path exists
      - [ ] Repo added to Repo list
      - [ ] If directory path not valid, 'Create a new repo' error message is present
    - [ ] `Cancel` closes modal, no repo added
    - [ ] Large repos (> 100MB) trigger Initialize Git LFS modal
      - [ ] Link takes user to (`https://git-lfs.github.com/`)
      - [ ] Local path to repo is displayed
      - [ ] User can click `Cancel` or `Initialize Git LFS`
  - [ ] Drag and drop repository
    - [ ] User can drag existing local repository into Desktop
      - [ ] Successful attempt adds repo to Repo list; else error message

### Publishing a repository
  - [ ] Publish Repository modal present if repo is unpublished and user clicks `Publish repository` button
    - [ ] GitHub tab is default; Enterprise tab is also present
      - [ ] User must be signed-in to publish, else `Sign In` button present on tab
    - [ ] Modal fields are Name, Description (optional), `Keep this code private` checkbox, Organization list (alpha order, tab-specific, if orgs exist), `Cancel` button, `Publish Repository` button
      - [ ] Clicking `Publish Repository` button pushes repo to GitHub.com or Enterprise; `Cancel` button closes modal
        - [ ] Repository is present on GitHub.com or Enterprise if published 
	- [ ] 'Visibility can't be private error' shown, if user's plan is not sufficient
	- [ ] A `.gitattributes` file is added to the repository as part of the initial commit
	- [ ] If repo is forked and upstream remote does not match, then modal is surfaced with Ignore/Update button 

### Application
  - [ ] Minimize, Maximize, Close buttons work in top nav
      - [ ] If user zooms in and quits app, settings should be retained when reopened
  - [ ] Double-clicking local desktop icon opens the application (Mac OS only)
  - [ ] Double clicking top nav bar toggles full-screen / last used screen-size (Mac OS only); Exit by (Mac: `^⌘f11`; Windows: `Alt`)
  - [ ] Clicking Desktop icon in dock/taskbar opens the application
  - [ ] Changing desktop icon name while app is open results in package error; closed app name change is successful

### GitHub Desktop menu top-level
  - [ ] About GitHub Desktop
    - [ ] Current version shown
    - [ ] Links to release notes (modal), terms (modal), licenses (modal)
    - [ ] Update banner shows `whats new` (modal) and `restart now`; App will restart with latest build
    - [ ] Update modal shows enhancements / bug fixes in latest build with `Install button`; user can X the banner
    - [ ] Clicking the build version number copies to clipboard
    - [ ] Edge case: If build is "old", error message displays warning user to "... manually check for updates".
      - [ ] Clicking `Check for updates` button produces "read-only volume" error message, with link for help
    - [ ] Clicking `Check for updates` button timestamps last attempt; periodic autochecking in the background
      - [ ] If update available, `Install Update` button will quit app and install update
      - [ ] If update available, download banner is present in main window with `restart` and `what’s new` links
      - [ ] If checking for update or download latest update in progress, the `Check for updates` button is disabled
      - [ ] Restarting the app automatically checks for updates
    - [ ] `Close` button closes modal 
  - [ ] Preferences/Options (Mac: `⌘,` Windows: `Ctrl+,`)
    - [ ] Accounts
      - [ ] GitHub.com name, handle, avatar, `sign out` button, if user signed in
      - [ ] Enterprise handle, avatar, `sign out` button, if user signed in
      - [ ] User can sign out of either account
      - [ ] User can be signed-in to both Enterprise and GitHub.com at same time  
    - [ ] Git
      - [ ] Username and email are displayed if `.gitconfig` configured for Welcome flow
      - [ ] `Save` button saves any changes made
      - [ ] `Cancel` button does not save any changes made; modal closed
    - [ ] Appearance
      - [ ] Light theme is default
      - [ ] Dark theme is optional 
      - [ ] For Mac, users can opt to match system preference theme with checkbox
    - [ ] Advanced
      - [ ] External Editor options shown in dropdown; else show "Install Atom?" link
      - [ ] Shell options shown in dropdown
      - [ ] Shared usage data option; selection carried through from Welcome flow
        - [ ] `anonymous usage data` link opens https://desktop.github.com/usage-data/
        - [ ] Verify postive `stats-opt-out` value in Dev Tools > Application > Local storage > file://
      - [ ] Confirmation dialogue for removing repositories is checked by default; user can toggle
          - [ ] Verify postive `ConfirmDiscardChanges` value in Dev Tools > Application > Local storage > file://
      - [ ] Confirmation dialogue for discarding files is checked by default; user can toggle
          - [ ] Verify postive `ConfirmRepoRemoval` value in Dev Tools > Application > Local storage > file://
      - [ ] `Save` button saves any changes made
      - [ ] `Cancel` button does not save any changes made; modal closed
  - [ ] Install command line tool installs tool at `/usr/local/bin/github` (Mac only as Windows done automagically; Helper may require password, else error message)
    - [ ] If already installed, user sees: "The command line tool has been installed at /usr/local/bin/github"
    - [ ] Clicking `OK` closes modal
  - [ ] Quit/Exit Desktop (Mac: `⌘Q`)
    - [ ] Quitting/Exiting and reopening Desktop returns you to last visited repo
  - [ ] Menu items are disabled if any modal is present; MacOS-default menu items not applicable   

### File top-level menu
  - [ ] New Repository... (Mac: `⌘N`; Windows: `Ctrl+N`)
  - [ ] Add Local Repository... (Mac: `⌘O`; Windows: `Ctrl+O`)
  - [ ] Clone Repository... (Mac: `⇧⌘O`; Windows: `Ctrl+Shift+O`)
  - [ ] Options... (Windows only: `Ctrl+,`)
  - [ ] Exit (Windows only; quits the app)

### Edit top-level menu
  - [ ] Undo (Mac: `⌘Z`; Windows: `Ctrl+Z`)
  - [ ] Redo (Mac: `⇧⌘Z`; Windows: `Ctrl+Y`)
  - [ ] Cut (Mac: `⌘X`; Windows: `Ctrl+X`)
  - [ ] Copy (Mac: `⌘C`; Windows: `Ctrl+C`)
  - [ ] Paste (Mac: `⌘V`; Windows: `Ctrl+V`)
  - [ ] Select all (Mac: `⌘A`; Windows: `Ctrl+A`)

### View top-level menu
  - [ ] Show Changes (Mac: `⌘1`; Windows: `Ctrl+1`)
  - [ ] Show History (Mac: `⌘2`; Windows: `Ctrl+2`)
  - [ ] Show Repositories List (Mac: `⌘T`; Windows: `Ctrl+T`)
  - [ ] Show Branches List (Mac: `⌘B`; Windows: `Ctrl+B`)
  - [ ] Go to Summary (Mac: `⌘G`; Windows: `Ctrl+G`)
  - [ ] Show/Hide Stashed Changes (Mac: `^H`; Windows: `Ctrl+H`)
  - [ ] Enter Full Screen (Mac: `^⌘F`; Windows: `F11`)
  - [ ] Reset Zoom (Mac: `⌘0`; Windows: `Ctrl+0`)
  - [ ] Zoom In (Mac: `⌘=`; Windows: `Ctrl+=`)
  - [ ] Zoom Out (Mac: `⌘-`; Windows: `Ctrl+-`)
  - [ ] Toggle Developer Tools (Mac: `⌥⌘I`; Windows: `Ctrl+Shift+I`)

### Repository top-level menu. (Only enabled if one repo present)
  - [ ] Push (Mac: `⌘P`; Windows: `Ctrl+P`)
    - [ ] Commits from repository are pushed to github.com; error message shown if conflicts
  - [ ] Pull (Mac: `⇧⌘P`; Windows: `Ctrl+Shirt+P`)
    - [ ] Commits from repository are pulled from github.com; error message shown if conflicts
  - [ ] Remove
    - [ ] Repository is removed from Repository List; confirmation dialogue shown if Preferences option enabled
  - [ ] View on GitHub (Mac: `⌥⌘G`; Windows: `Ctrl+Alt+G`)
    - [ ] Repository on github.com is opened; must be logged in if private repository or Enterprise repository
  - [ ] Open in [insert shell] (Mac: `^[tilde-sign]`; Windows: ); see Shell options in preferences
    - [ ] Local repository is opened
    - [ ] If git not installed, modal asks to Open with Git or Install Git
  - [ ] Show in Finder/Explorer (Mac: `⇧⌘F`; Windows: `Ctrl+Shift+F`)
    - [ ] Local repository is opened
  - [ ] Open in [insert editor] (Mac: `⇧⌘A`; Windows: `Ctrl+Shift+A`); see External Editor option in preferences
    - [ ] Secondary modal appears if no Editors set; option to Download Atom 
  - [ ] Repository settings...
    - [ ] Remote path can be edited for existing repository; origin already set. Cannot be empty string, else error message.
      - [ ] `Saved` button saves last entry
      - [ ] `Cancel` button closes modal
    - [ ] User can opt for `Setup custom remote` for a non-GitHub repository
      - [ ] `Save & Publish` button saves last entry
      - [ ] `Cancel` button closes modal
    - [ ] Ignored Files
      - [ ] `.gitignore` file contents are shown and can be edited
	- [ ] `Saved` button saves last entry; changes create a new commit
	- [ ] `Cancel` button closes modal

### Branch top-level menu
  - [ ] New Branch... (Mac: `⇧⌘N`; Windows: `Ctrl+Shift+N`)
    - [ ] Clicking `Create Branch` makes new branch based on the entered name, if not a duplicate
    - [ ] Master branch is mentioned in the list; current branch shown first
    - [ ] `Cancel` button closes modal
  - [ ] Rename... (cannot be default branch)
    - [ ] `Rename` button changes branch name if field updated
      - [ ] Same branch on github.com is not renamed
    - [ ] `Cancel` button closes modal
    - [ ] Protected branches cannot be renamed
  - [ ] Delete... (cannot be default branch)
    - [ ] Option to delete branch on the remote; default is unchecked
    - [ ] `Delete` button deletes branch (and remote too if option checked)
    - [ ] `Cancel` button closes modal
    - [ ] Protected branches cannot be deleted
  - [ ] Update from [default branch] (cannot be default; Mac: `⇧⌘U`; Windows: `Ctrl+Shift+U`)
    - [ ] Merge success banner is shown temporarily; user can `X` to remove
  - [ ] Compare to Branch (Mac: `⇧⌘B`; Windows: `Ctrl+Shift+B`)
    - [ ] Takes you to the history tab with the input selected so you can directly choose a branch
  - [ ] Merge into Current Branch... (Mac: `⇧⌘M`; Windows: `Ctrl+Shift+M`)
    - [ ] Use can filter to find existing branches
    - [ ] User can select branch, other than current one
    - [ ] Merge hint shows status and branches to be merged
    - [ ] `Merge` button only activated if something to merge (includes awaiting conflicts)
      - [ ] If merged, success banner is shown temporarily; user can `X` to remove
      - [ ] If conflicts, conflict modal shows quantity of files, ability to open in [editor], open in command line, `Abort` button, while `Commit merge` button is deactivated until files are resolved; Changes tab shows all files 
        - [ ] If conflict resolved, files marked green, and user can click `Commit merge` button
	    - [ ] If merged, success banner is shown temporarily; user can `X` to remove
	    - [ ] Binary files must be resolved in command line before committing merge
        - [ ] Aborting partially resolved commit surfaces "Are you sure?" dialogue; `Cancel` or `Abort merge` buttons
  - [ ] Rebase Current Branch...
    - [ ] User can filter to find existing branches
    - [ ] User can select branch, other than current one
    - [ ] Rebase hint shows status and branches to be merged
    - [ ] `Start rebase` button only activated if something to rebase
      - [ ] If rebase, success banner is shown temporarily; user can `X` to remove
      - [ ] If conflicts, conflict modal shows quantity of files, ability to open in [editor], open in command line, `Abort` button, while `Continue rebase` button is deactivated until files are resolved
        - [ ] If conflicts resolved, files marked green, and user can click `Continue rebase` button
	    - [ ] If rebased, success banner is shown temporarily; user can `X` to remove
        - [ ] Aborting partially resolved rebase surfaces "Are you sure?" dialogue; `Cancel` or `Abort merge` buttons
  - [ ] Compare on GitHub (Mac: `⇧⌘C`; Windows: `Ctrl+Shift+C`) (if repository already published on `github.com`)
  - [ ] Create Pull Request (Mac: `⌘R`; Windows: `Ctrl+R`) opens Pull Request on `github.com` 
    - [ ] If branch unpublished, dialogue asks to publish the branch
    - [ ] `Push Local Changes` modal surfaces with option to `Create Without Pushing` and `Push Commits`;(trigger: `Create Pull Request` after commit on branch before pushing)

### Window top-level menu (Mac only)
  - [ ] Minimize, Zoom (maximize app size), Close, Bring All to Front, GitHub Desktop

### Help top-level menu
  - [ ] `Report Issue...` opens issue filing in Desktop repository on `github.com`
  - [ ] `Contact GitHub Support...` opens `https://github.com/contact` page with user and build prepopulated
  - [ ] `Show User Guides` opens Desktop help page on `github.com`
  - [ ] `Show Keyboard Shortcuts` opens `https://help.github.com/en/desktop/getting-started-with-github-desktop/keyboard-shortcuts-in-github-desktop`
  - [ ] `Show Logs in Finder/Explorer` opens Finder/Explorer logs in local directory
    - [ ] Mac: `ls ~/Library/Application\ Support/GitHub\ Desktop/Logs/*.log`
    - [ ] Windows: `%LOCALAPPDATA%\\Desktop\\*.desktop.production.log`
  - [ ] About GitHub Desktop (Windows only)
  
### Next Steps (wip)

### Repositories list
  - [ ] Current repository is always shown in top slot with respective icon; if repository exists
  - [ ] Opening list shows all repositories, categorized by owner in alpha format with a working filter
    - [ ] If more than six repostories, a Recent group will appear at the top of the list; limit 3 repositories
    - [ ] `ESC` clears the filter
    - [ ] Search filter match results in bold characters
    - [ ] A repository with uncommitted files shows a `•` next to name
    - [ ] All repositories (private, enterprise, local, public, forked, other) have proper icon and found in the proper category (GitHub.com/Enterprise/Other)
      - [ ] Hover shows username/repository, url, and/or local path in tooltip
      - [ ] User must have paid account for private repositories
      - [ ] Repository icon is updated if admin changes status (public vs private)
  - [ ] `Add` button dropdown shows three options: Clone Repository, Add Existing Repository, Create New Repository    
  - [ ] Repositories cloned from non-github servers should always be in the Other group, and have the 'computer' icon.
  - [ ] Selecting a repository updates Changes/History/Diff areas
    - [ ] If no Changes, Diff area shows `Open this repository` link to Finder/Explorer on local
  - [ ] `Right-click` reveals `Open in [Shell]`, `Open in Finder/Explorer`, `Open in [Editor]`, and `Remove` options
  - [ ] Repositories which have been removed locally (and trash emptied) have 'cannot find repository' warning
    - [ ] Relaunching the app when it displays a missing repository preserves the repository's name and last seen path
    - [ ] Remove a repository which can not be found (deleted locally & trash emptied)
  - [ ] Repositories which are cloning display a progress bar

### Changes tab
  - [ ] Changes tab shows `•` icon if files are waiting to be committed
    - [ ] Number of changed files is always present; it can be 0
  - [ ] Any changed files appear in the list, with respective +/•/- sign; with arrow keys enabled
    - [ ] Merge-conflicted files shown with hazard icon; cannot be committed until fixed
    - [ ] User can check none, or check one or more files to commit; list is scrollable
      - [ ] User can select one or more lines to commit; diff is scrollable
      - [ ] Right-clicking opens context menu
        - [ ] User can discard the file (or all files); pending confirmation dialogue
	  - [ ] `Do not show this message again`overrides the preference setting if true  
        - [ ] User can ignore single/all files, show in Finder/Explorer, reveal in external editor, or open in default program
	  - [ ] A specific file can only be ignored once
	  - [ ] All ignored files found in Repository Settings > Ignored Files tab
	- [ ] User can open in finder, preferred editor, or OS default program  
  - [ ] Panes can be resized horizontally, and contents resize to take the full width
    - [ ] Quitting Desktop and relaunching remembers pane sizes
  - [ ] Uncommitted files are optionally stashed if user attempts to switch branches
    - [ ] Modal asks user to stash on current branch or bring changes to new branch; `Cancel` or `Switch Branch` buttons
      - [ ] If stashed then changes shown under Stashed Changes section below Changes tab when returning to the original branch
        - [ ] Stashed changes section show all stashed files and diffs; user can discard or restore to Changes
      - [ ] If moved to new branch, all previously changed files will exist under Changes tab on the new branch

### History tab
  - [ ] History tab shows commits on your current branch by default
    - [ ] All commits listed in chronological order, with avatar, date and name; list is scrollable with arrow keys enabled
      - [ ] Right clicking any commit shows options: Revert This Commit, Copy SHA, View on GitHub
      - [ ] Hover shows file name in tooltip
    - [ ] Placing cursor in search field show all branches with number of commits behind/ahead; list is alpha and categorized
      - [ ] Filtering for branch name that doesn't exist shows "Sorry, I can't find that branch"
    - [ ] User can search to a target branch to filter commits; `esc` key to exit; autocomplete and text prediction intact
      - [ ] User can toggle between behind/ahead, with counts shown; Behind tab is shown by default
          - [ ] If more than 0 commits behind, a list of commits are shown in reverse chronological order
          - [ ] If more than 0 commits ahead, a list of commits are shown in reverse chronological order
      - [ ] User can merge in any commits into current branch for the "behind" tab; (button disabled if 0 commits behind)
        - [ ] Merge hint shown below `Merge into X` button with status, numbers of commits, and branch names
        - [ ] After successful merge, tab counts update and merge button is disabled
        - [ ] Merge conflict results in dialog shown directing user to commit view
    - [ ] Merge prompt shown above filter if comparing two branches and commits are behind default branch
      - [ ] `View commits` shows commits in Changes list, `Merge... opens Merge in Current Branch modal`, or `X` to close
	
### Diffs section (History tab)		
  - [ ] All commits have avatar, selectable SHA, # of files changed, commit message, commit description (optional)
    - [ ] Long commit descriptions can be toggled with expand/collapse icon
      - [ ] Reverting commit repopulates commit area
        - [ ] Error message if no changes to commit
  - [ ] All files within a commit listed, with respective +/•/-/-> sign; list is scrollable
    - [ ] Diffs are viewable; list is scrollable with arrow keys enabled
      - [ ] Green is for additions, red for deletions
      - [ ] Different file types are rendered properly
      - [ ] Single pic file with the `->` sign has multiple view options: 2-up (default); Swipe; Onion Skin; and Difference
  - [ ] Panes can be resized horizontally, and contents resize to take the full width
  - [ ] Diffs cannot be over 3MB
  - [ ] Diffs cannot be longer than 500,000 characters 

### Commit section (Changes tab)
  - [ ] Commit created if user clicks `Commit to [branch]` button with commit message and at least one checked file
    - [ ] `Fetch origin` changes to `Push` with number of commits badge
  - [ ] Avatar of user is shown
  - [ ] User can 'at-mention' those associated with the respective repository; either summary or description field is ok (published repositories only)
  - [ ] User can 'pound-mention' an issue in the either summary or description field; issue number should populate (published repositories only)
  - [ ] Summary field is required
  - [ ] Description field is optional
  - [ ] User can undo last commit
    - [ ] `Push` with number of commits badge is decremented or reverts to `Fetch origin`
  - [ ] `Undo` button disabled if user is pushing commit
  - [ ] User can publish a new repository with no commits (aka unborn repository/branch)
  - [ ] User can make new branch the default branch, by making the intial commit on the new branch
  - [ ] User can select individual file(s) -- and individial lines of a file(s) -- to commit at a time
  
### Co-authoring (Changes tab)
  - [ ] clicking co-author icon toggles co-author field; or right-click within commit area
    - [ ] Hovering over the icon reveals add/remove 'action' text
    - [ ] Right-click includes Mac/Windows context menus; option greyed out if repo not published to github.com
    - [ ] User can tag other GitHub.com users only, or those within your Enterprise org
      - [ ] Tag is tied to public API name/email; email is "no-reply" if user setting is enabled
      - [ ] Mouseover tooltip reveals name and email of any entered tags
      - [ ] Tagging those outside of GitHub turns tag red
      - [ ] You cannot tag a user more than once via the autocomplete; manually you can
      - [ ] Typing a GitHub name not part of the initial autocomplete will initiate a search
        - [ ] Found names are tagged; all others are turned red
        - [ ] Navigating away from the Changes tab will clear red tags 
     - [ ] Toggling the co-author icon clears the field
  - [ ] All co-authors show up in History and diff view
    - [ ] Commits with `Co-Authored-By: Name <username@github.com>`in the decription field reveal avatar of user    
    - [ ] Hovering over an avatar reveals all tagged users
    - [ ] Hovering over the "people" text reveals all names/emails of tagged users
  - [ ] Undoing a commit re-enables the valid tags
  - [ ] Reverting a commit does not re-enable any tags

### Branches list
  - [ ] Current branch always shows if repository present
    - [ ] Hover shows full branch name in tooltip
    - [ ] Long branch names are truncated, with beginning/end of branch name shown
  - [ ] Opening list shows all branches in categorized format with a working filter
    - [ ] `New` button opens 'New Branch' modal
    - [ ] If filters results are nil, then prefill branch name in modal if user clicks `Create New Branch`
    - [ ] Active branch is highlighted and marked with a check
    - [ ] `esc` clears the filter
    - [ ] Search filter match results in bold characters
    - [ ] Hover shows full branch name in tooltip
    - [ ] `Choose a branch to merge into [current branch]` button is shown; (Mac: `⇧⌘M`; Windows: `Ctrl+Shift+M`)
  - [ ] Default branch labeled and listed first, with timestamp
  - [ ] Selecting a branch switches branches
  - [ ] Creating a new branch shows `Publish branch` button
    - [ ] Publishing successful if logged in only; else error message
      - [ ] `Create Pull Request` menu option shows warning if branch not published yet
  - [ ] Renamed branches updated on github.com and vice-versa if logged in; else error message
    - [ ] Opens modal with ability to enter new name
  - [ ] Deleted branches updated on github.com and vice-versa if logged in; else error message
    - [ ] Deleting branch show warning message

### Fetching origin/Pull
  - [ ] Code is constantly being fetched from github.com with timestamp
     - [ ] Hover shows timestamp in tooltip
    - [ ] If Pull Requests on github.com, they are reflected with down arrow and quantity
    - [ ] Pull Requests and Commits can co-exist; error surfaces if merge commit
  - [ ] User cannot Push/Pull without being signed-in; error message surfaced
    - [ ] Push/Pull works with public/private/Enterprise repos
    - [ ] Tooltip shows status upon hover, if progress to display
  - [ ] When a branch is local-only make sure that the `Fetch` button changes to `Publish` and it publishes
  
### Publishing only
  - [ ] Unpublished repository, unborn HEAD - `Publish button` enabled (user can publish repository)
  - [ ] Unpublished repository, valid branch - `Publish button` enabled (user can publish repository and branch)
  - [ ] Published repository, unborn HEAD - `Publish button` disabled (no branch to push)
  - [ ] Published repository, branch without tracking - `Publish button` enabled (user can publish branch)
  - [ ] Published repository, network action - `Publish button` disabled (don't interfere with existing action)
  
### Github.com
  - [ ] If Desktop linked to .com (/settings/applications), the Desktop icon should show on File Revisions tab for all Pull Requests
    - [ ] Clicking the "computer icon" opens from a Pull Request page opens the branch on Desktop
  - [ ] `Open in Desktop` button under a repo's `Clone and Download` button should open repo in Desktop
  - [ ] If private email is enabled (http://github.com/settings/emails), user is blocked from pushing to all associated repositories on Desktop?
  - [ ] If user updates name in Settings, change should reflect in Preferences

### Pull Request list + Continuous Integration (CI) status
 - [ ] Pull request list shown as tab on Branch list; quality shown in tab
   - [ ] Only open Pull Requests are reflected; closed Pull Requests are not shown in the list
 - [ ] Pull Request toolbar status is surfaced with yellow/green/red icon, or no icon if no status
 - [ ] If no pull requests, then no badge shown, and Pull Request tab shows `0` 
   - [ ] User shown current branch in text area, and given option to create a new branch or create new pull request
 - [ ] Pull request for the current branch selected by default, with pull-request-number badge in header
   - [ ] Pull request list can be filtered; `esc` key clears filter; arrow keys can scroll list
   - [ ] Results in chronological order, with name, id number, date, username, and CI status (if enabled)
     - [ ] Status checks run frequently in background, especially if yellow
     - [ ] If user hovers over CI status icons, tooltips show individual/group status details
 - [ ] PR status can be updated independently of respective PR
 
### Security
 - [ ] `Untrusted server` warning surfaced if GitHub cannot verify the identity of `api.github.com`; user can `Cancel` or `Continue`
