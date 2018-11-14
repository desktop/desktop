# Adding tests to the project

This document explains a bit about our testing infrastructure, and how you can
contribute tests to go with changes to the codebase.

## Overview

The tests we have in the repository are found under `app/test` and are organized
into these subdirectories:

 - `unit` - unit tests for small parts of the codebase. This currently makes up
   the majority of our tests.
   - the subdirectories defined here are intended to match the layout of the
     `app/src/` directory, but this has not been rigorously defined and will be
     affected by our plans in [#5645](https://github.com/desktop/desktop/pull/5645)
     to evolve the source layout
 - `integration` - these tests are for end-to-end testing and involve launching
    and driving the app using UI automation

Other important folders:

 - `fixtures` - this folder contains Git repositories which can be used in tests
 - `helpers` - modules containing logic to help setup, manage and teardown tests
 - `__mocks__` - this is a special Jest folder that contains mocks for Electron
   APIs, which are only stubbed out when tests require it

## Adding Unit Tests

Unit tests are ideal for functions that don't depend on the DOM or Electron
APIs, so if you are working on some code that will benefit from writing tests
here is a guide to getting this working.

First , check under `app/test/unit` for an existing test module related to the
area you are working in - we want to ensure each test module corresponds to a
specific application module.

### Creating a new test module

If no test module exists, create a new file named `[app-module]-test.ts` where
`[app-module]` is the filename of the application module you are working in.

Start with this for the contents of the file:

```ts
describe('module being tested', () => {
  it('can test some code', () => {
    expect(true).toEqual(false)
  })
})
```

If you run `yarn test:unit` from a shell you should see this error, which
indicates the file is loaded into our Jest runner successfully.

Once you're happy that the test is being run, feel free to write some proper
tests to exercise your work.

### Adding tests to a test module

Feel free to borrow ideas from our [current test suite](https://github.com/desktop/desktop/tree/master/app/test/unit),
but here are some guidelines to help you figure out what to test.

 - focus on a specific module or function when writing unit tests - complex unit
   tests are a sign that the code isn't organized in an ideal way for testing,
   or that the test is doing too much
 - write tests to cover the scenarios you think we should care about in the
   long-term (these are great to help us not accidentally regress your work)
 - keep tests simple and easy to read - code comments shouldn't be necessary
 - if you're not confident in writing tests, the [Arrange-Act-Assert](http://wiki.c2.com/?ArrangeActAssert)
   pattern is a nice way to get started

As you're writing your tests, don't forget to `yarn test:unit` to verify that
your tests are working as expected.

## Specific Testing Scenarios

### State updates in `AppStore`

If you find yourself writing complex rules as part of updating application
state, consider whether you can extract the logic to a function that lives
outside of `AppStore`.

This has some important benefits:

 - by extracting it from `AppStore`, we can write a pure function that avoids
   any implicit state and clearly declares what it needs as parameters
 - by following a pattern of writing functions that take the current state and
   generate new state, we keep each function focused on a particular task
 - because the function only depends on the arguments it receives, this becomes
   much easier to test

An example of this is `updateChangedFiles` in
[`app/src/lib/stores/updates/changes-state.ts`](https://github.com/desktop/desktop/blob/15294ad41016e2fe393ffe942d48ca36cec144e5/app/src/lib/stores/updates/changes-state.ts#L22)
which updates the repository state to ensure selection state is remembered
correctly.

```ts
export function updateChangedFiles(
  state: IChangesState,
  status: IStatusResult,
  clearPartialState: boolean
): ChangedFilesResult {
  ...
}
```

This uses the current `IChangesState`, as well as additional parameters and
returns an object containing the changes that should be applied create a new
`IChangesState` for the repository:

```ts
/**
 * Internal shape of the return value from this response because the compiler
 * seems to complain about attempts to create an object which satifies the
 * constraints of Pick<T,K>
 */
type ChangedFilesResult = {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selectedFileIDs: string[]
  readonly diff: IDiff | null
}
```

And the return value is merged into the current state:

```ts
this.repositoryStateCache.updateChangesState(repository, state =>
  updateChangedFiles(state, status, clearPartialState)
)
```


### Transitioning to Jest

For historical reasons, we currently have a mix of `chai` and `jest` assertions
floating around. This is because we were previously using `electron-mocha` to
run these tests, which didn't provide a built-in assertion library.

If you open a PR that updates a test module, the reviewer may ask you to also
update the test module to deprecate the use of `chai` in existing tests.

The easiest way to do this is to remove the line that looks like this:

```ts
import { expect } from 'chai'
```

This will then trigger a number of compiler errors, which should be easy to
update to the relevant built-in assertions.

Here's an example of the changes to a recent PR:

```diff
commit c1e5868a95ca0bebee8176d49f6c1401c549ab43
Author: Brendan Forster <github@brendanforster.com>
Date:   Tue Oct 23 17:11:14 2018 -0300

    port tests over to use jest builtin

diff --git a/app/test/unit/repository-matching-test.ts b/app/test/unit/repository-matching-test.ts
index 35fddfb44..f8edbd741 100644
--- a/app/test/unit/repository-matching-test.ts
+++ b/app/test/unit/repository-matching-test.ts
@@ -1,5 +1,3 @@
-import { expect } from 'chai'
-
 import {
   matchGitHubRepository,
   urlMatchesRemote,
@@ -18,8 +16,8 @@ describe('repository-matching', () => {
         accounts,
         'https://github.com/someuser/somerepo.git'
       )!
-      expect(repo.name).to.equal('somerepo')
-      expect(repo.owner).to.equal('someuser')
+      expect(repo.name).toEqual('somerepo')
+      expect(repo.owner).toEqual('someuser')
     })

     it('matches HTTPS URLs without the git extension', () => {
@@ -30,8 +28,8 @@ describe('repository-matching', () => {
         accounts,
         'https://github.com/someuser/somerepo'
       )!
-      expect(repo.name).to.equal('somerepo')
-      expect(repo.owner).to.equal('someuser')
+      expect(repo.name).toBe('somerepo')
+      expect(repo.owner).toBe('someuser')
     })

     it('matches git URLs', () => {
@@ -42,8 +40,8 @@ describe('repository-matching', () => {
         accounts,
         'git:github.com/someuser/somerepo.git'
       )!
-      expect(repo.name).to.equal('somerepo')
-      expect(repo.owner).to.equal('someuser')
+      expect(repo.name).toBe('somerepo')
+      expect(repo.owner).toBe('someuser')
     })

     it('matches SSH URLs', () => {
@@ -54,8 +52,8 @@ describe('repository-matching', () => {
         accounts,
         'git@github.com:someuser/somerepo.git'
       )!
-      expect(repo.name).to.equal('somerepo')
-      expect(repo.owner).to.equal('someuser')
+      expect(repo.name).toBe('somerepo')
+      expect(repo.owner).toBe('someuser')
     })

     it(`doesn't match if there aren't any users with that endpoint`, () => {
@@ -74,7 +72,7 @@ describe('repository-matching', () => {
         accounts,
         'https://github.com/someuser/somerepo.git'
       )
-      expect(repo).to.equal(null)
+      expect(repo).toBeNull()
     })
   })

@@ -90,27 +88,27 @@ describe('repository-matching', () => {
       }

       it('does not match null', () => {
-        expect(urlMatchesRemote(null, remoteWithSuffix)).is.false
+        expect(urlMatchesRemote(null, remoteWithSuffix)).toBe(false)
       })

       it('matches cloneURL from API', () => {
         const cloneURL = 'https://github.com/shiftkey/desktop.git'
-        expect(urlMatchesRemote(cloneURL, remoteWithSuffix)).is.true
+        expect(urlMatchesRemote(cloneURL, remoteWithSuffix)).toBe(true)
       })

       it('matches cloneURL from API without suffix', () => {
         const cloneURL = 'https://github.com/shiftkey/desktop.git'
-        expect(urlMatchesRemote(cloneURL, remote)).is.true
+        expect(urlMatchesRemote(cloneURL, remote)).toBe(true)
       })

       it('matches htmlURL from API', () => {
         const htmlURL = 'https://github.com/shiftkey/desktop'
-        expect(urlMatchesRemote(htmlURL, remoteWithSuffix)).is.true
+        expect(urlMatchesRemote(htmlURL, remoteWithSuffix)).toBe(true)
       })

       it('matches htmlURL from API without suffix', () => {
         const htmlURL = 'https://github.com/shiftkey/desktop'
-        expect(urlMatchesRemote(htmlURL, remote)).is.true
+        expect(urlMatchesRemote(htmlURL, remote)).toBe(true)
       })
     })

@@ -120,16 +118,16 @@ describe('repository-matching', () => {
         url: 'git@github.com:shiftkey/desktop.git',
       }
       it('does not match null', () => {
-        expect(urlMatchesRemote(null, remote)).to.be.false
+        expect(urlMatchesRemote(null, remote)).toBe(false)
       })

       it('matches cloneURL from API', () => {
         const cloneURL = 'https://github.com/shiftkey/desktop.git'
-        expect(urlMatchesRemote(cloneURL, remote)).to.be.true
+        expect(urlMatchesRemote(cloneURL, remote)).toBe(true)
       })
       it('matches htmlURL from API', () => {
         const htmlURL = 'https://github.com/shiftkey/desktop'
-        expect(urlMatchesRemote(htmlURL, remote)).to.be.true
+        expect(urlMatchesRemote(htmlURL, remote)).toBe(true)
       })
     })
   })
@@ -181,13 +179,13 @@ describe('repository-matching', () => {
           'https://github.com/shiftkey/desktop.git',
           repository
         )
-      ).is.true
+      ).toBe(true)
     })

     it(`returns true when URL doesn't have a .git suffix`, () => {
       expect(
         urlMatchesCloneURL('https://github.com/shiftkey/desktop', repository)
-      ).is.true
+      ).toBe(true)
     })

     it(`returns false when URL belongs to a different owner`, () => {
@@ -196,7 +194,7 @@ describe('repository-matching', () => {
           'https://github.com/outofambit/desktop.git',
           repository
         )
-      ).is.false
+      ).toBe(false)
     })

     it(`returns false if GitHub repository does't have a cloneURL set`, () => {
@@ -205,7 +203,7 @@ describe('repository-matching', () => {
           'https://github.com/shiftkey/desktop',
           repositoryWithoutCloneURL
         )
-      ).is.false
+      ).toBe(false)
     })
   })
 })
```
