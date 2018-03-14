# Releasing Updates

## Channels

We have three channels to which we can release: `production`, `beta`, and `test`.

- `production` is the channel from which the general public downloads and receives updates. It should be stable and polished.

- `beta` is released more often than `production`. We want to ensure `master` is always in a state where it can be released to users and we will use `beta` for additional QA.

- `test` is unlike the other two. It does not receive updates. Each test release is locked in time. It's used entirely for providing test releases.

## The Process

### 1. GitHub Access Token

From a clean working directory, set the `GITHUB_ACCESS_TOKEN` environment variable to a valid [Personal Access Token](https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/) 

You can check that this is set on macOS by:
```shellsession
$ env GITHUB_ACCESS_TOKEN
```

You can check that this is set on Windows by:
```shellsession
$ echo %GITHUB_ACCESS_TOKEN%
```

If you are creating a new Personal Access Token on GitHub:
* make the token memorable - use a description like `Desktop Draft Release and Changelog Generator`
* the `read:org` scope is the **only** required scope for drafting releases

You can add an access token as an environment variable on macOS by: 
```shellsession
$ export GITHUB_ACCESS_TOKEN={your token here}
```

You can add an access token as an environment variable on Windows by: 
```shellsession
$ set GITHUB_ACCESS_TOKEN={your token here}
```

### 2. Create Draft Release

Once the personal access token is set, run the script below, which will determine the next version from what was previously published, based on the desired channel.

For `production` and `beta` releases, run:

```shellsession
$ yarn draft-release (production|beta)
```

(For `test` releases, follow the directions in the steps below to update `app/package.json`'s `version` to a higher version and add a changelog entry. The script does not support test yet.)

The script will output a draft changelog, which covers everything that's been merged, and probably needs some love.
The output will then explain the next steps:

```shellsession
Here's what you should do next:

1. Update the app/package.json 'version' to '1.0.14-beta2' (make sure this aligns with semver format of 'major.minor.patch')
2. Concatenate this to the beginning of the releases element in the changelog.json as a starting point:
{
  "1.0.14-beta2": [
    "[???] Add RubyMine support for macOS - #3883. Thanks @gssbzn!",
    "[???] Allow window to accept single click on focus - #3843",
    "[???] Drop unnecessary comments before issue template - #3906",
    "[???] First-class changelog script for generating release notes - #3888",
    "[???] Fix expanded avatar stack overflow - #3884",
    "[???] Switch to a saner default gravatar size - #3911",
    "[Fixed] Add a repository settings store - #934",
    "[Fixed] Ensure renames are detected when viewing commit diffs - #3673",
    "[Fixed] Line endings are hard, lets go shopping - #3514",
  ]
}

3. Remove any entries of contributions that don't affect the end user
3. Update the release notes to have user-friendly summary lines
4. For issues prefixed with [???], look at the PR to update the prefix to one of: [New], [Added], [Fixed], [Improved], [Removed]
5. Sort the entries so that the prefixes are ordered in this way: [New], [Added], [Fixed], [Improved], [Removed]
6. Commit the changes (on master or as new branch) and push them to GitHub
7. Read this to perform the release: https://github.com/desktop/desktop/blob/master/docs/process/releasing-updates.md
```

** Note: You should ensure the `version` in `app/package.json` is set to the new version and follows the [semver format](https://semver.org/) of `major.minor.patch`. 

Examples:
* for prod, `1.1.0` -> `1.1.1` or `1.1.13` -> `1.2.0` 
* for beta, `1.1.0-beta1` -> `1.1.0-beta2` or `1.1.13-beta3` -> `1.2.0-beta1`
* for test, `1.0.14-test2` -> `1.0.14-test3` or `1.1.14-test3` -> `1.2.0-test1`

Here's an example of the previous changelog draft after it has been edited:

```json
{
  "1.0.14-beta2": [
    "[Added] Add RubyMine support for macOS - #3883. Thanks @gssbzn!",
    "[Fixed] Allow window to accept single click on focus - #3843",
    "[Fixed] Expanded avatar list hidden behind commit details - #3884",
    "[Fixed] Renames not detected when viewing commit diffs - #3673",
    "[Fixed] Ignore action assumes CRLF when core.autocrlf is unset - #3514",
    "[Improved] Use smaller default size when rendering Gravatar avatars - #3911",
  ]
}
```

Once you've pushed up the version update and the changelog changes, you're ready to release! Get the others on the team to :thumbsup: in a PR if you're not sure. Note that any version change that does not have an associated changelog entry will not successfully release.

### 3. Releasing

When you feel ready to start the deployment, run this command in Chat:

```
.release! desktop/YOUR_BRANCH to {production|beta|test}
```

If you are releasing from master, YOUR_BRANCH is unnecessary; write:
```
.release! desktop to {production|beta|test}
``` 

We're using `.release` with a bang so that we don't have to wait for any current CI on the branch to finish. This might feel a little wrong, but it's OK since making the release itself will also run CI.

If you're releasing a `production` update, release a `beta` update for the next version too, so that beta users are on the latest release.

### 4. Check for Completed Release

Go to [Central's Deployments](https://central.github.com/deployments) to find your release; you'll see something at the top of the page like:
```
desktop/desktop deployed from {YOUR_BRANCH}@{HASH_ABBREVIATION_FOR_COMMIT} to {production|beta|test}
```
it will initially specify its state as `State: pending` and will be completed when it says `State: released`

You will also see this in Chat:
`desktopbot tagged desktop/release-{YOUR_VERSION}`
  
When it's in `State: released` for `beta` or `production`, switch to your desktop application and make sure that the corresponding (prod|beta) app auto-updates.
If you don't have the app for `beta`, for example, you can always download the previous version on Central to see it update (but make sure you move it out of the Downloads folder and into the Applications folder for macOS or it won't auto-update).

### 5. Check Error Reporting

If an error occurs during the release process, a needle will be reported to Central's [haystack](https://haystack.githubapp.com/central).

It is normal to monitor haystack closely for 15 minutes just to make sure.

### 6. Celebrate

Once your app updates and you see the visible changes in your app and there are no spikes in errors, celebrate 🎉!!! You did it!

Also it might make sense to continue to monitor haystack in the background for the next 24 hours.