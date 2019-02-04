# Crafting Git Tests

This document outlines the options available for creating tests around Git
repositories and data.

## Repository Fixtures

The `app/test/fixtures` directory is a special folder on disk that can be used
to capture snapshots of a Git repository for testing. This is ideal for
situations where:

 - capturing the whole repository state (including working directory and
   config), such as a regression test
 - the manual work to create the repository from scratch is not worth performing
   on every test run

There are some downsides to this approach:

 - the entire repository is committed within the Desktop repository, so large
   repositories are not suitable to be imported with this approach
 - there is automated tooling for importing a repository currently
 - updating a repository if a test case changes is not supported - you'll need
   to do the import again with the new state

### Importing a Git repository

The manual steps to add a repository fixture for testing are:

 - inside the Git repository you want to import, rename all `.git` directories
   to `_git`
 - create a new folder inside `app/test/fixtures` named in a way that relates to
   the tests being performed on it. The placeholder `{your-new-folder}`
   in subsequent steps to represent whatever name you have chosen here.
 - copy the repository contents into `app/test/fixtures/{your-new-folder}`
 - cleanup any `app/test/fixtures/{your-new-folder}/_git/hooks/*.sample` files
   as these are not needed for testing (and will simplify the diff a bit)

Once you have done that, in your test you need to use `setupFixtureRepository`
with the first parameter being the name of your test fixture folder.

This will return a temporary path to the repository, which is cleaned up after
the test run is completed.

Here's an example of a test using `setupFixtureRepository`:

```ts
import {
  setupFixtureRepository,
} from '../../helpers/repositories'

// ...

it('returns detached for arbitrary checkout', async () => {
  const path = await setupFixtureRepository('{your-new-folder}')
  const repository = new Repository(path, -1, null, false)

  // act
  // assert
})
```

## Repository Scaffolding

The newer approach that we are experimenting with is to provide scaffolding APIs
to declaratively get the repository into a state for testing. This approach is
ideal for situations when:

 - a baseline repository can differ slightly between tests, and it's easier to
   programatically apply the changes than create multiple test fixtures
 - the workflows being developed may change over time, and the tests themselves
   should be flexible (and be easy to identify how they evolve)

Three patterns have been implemented to support workflows we are currently
developing:

 - `cloneRepository` - make a copy of a test repository so that
    `push`/`pull`/`fetch` can be emulated and tested without using the network
 - `makeCommit` - express the changes to the working directory that should be committed
 - `switchTo` - a quick way to checkout (and create if needed) a branch in the
   repository

This is an example test for `pull` behaviour which uses this scaffolding:

```ts
describe('ahead and behind of tracking branch', () => {
  let repository: Repository

  beforeEach(async () => {
    const remoteRepository = await createRepository(featureBranch)
    repository = await cloneRepository(remoteRepository)

    // make a commits to both remote and local so histories diverge

    const changesForRemoteRepository = {
      commitMessage: 'Changed a file in the remote repository',
      entries: [
        {
          path: 'README.md',
          value: Buffer.from('# HELLO WORLD! \n WORDS GO HERE! \nLOL'),
        },
      ],
    }

    await makeCommit(remoteRepository, changesForRemoteRepository)

    const changesForLocalRepository = {
      commitMessage: 'Added a new file to the local repository',
      entries: [
        {
          path: 'CONTRIBUTING.md',
          value: Buffer.from('# HELLO WORLD! \nTHINGS GO HERE\nYES, THINGS'),
        },
      ],
    }

    await makeCommit(repository, changesForLocalRepository)
    await fetch(repository, null, origin)
  })

  describe('by default', () => {
    let previousTip: Commit
    let newTip: Commit

    beforeEach(async () => {
      previousTip = await getTipOrError(repository)

      await pull(repository, null, origin)

      newTip = await getTipOrError(repository)
    })

    it('creates a merge commit', async () => {
      const newTip = await getTipOrError(repository)

      expect(newTip.sha).not.toBe(previousTip.sha)
      expect(newTip.parentSHAs).toHaveLength(2)
    })
  })
})
```

## Additional Git operations

Once you have a `Repository` initialized in a test, if you need to run
additional Git commands on the repository it is recommended to use
`GitProcess.exec` from `dugite`. We recommend this approach over reusing the Git
APIs created for Desktop in `app/src/lib/git` for a few reasons:

 - the Git command line has lots of detailed documentation and options, which we
   can use without needing to add this behaviour to Desktop's Git APIs
 - test setup should not be coupled to application behaviour, in case that
   application behaviour can change in the future
 - by making the Git test setup explicit, we can focus on what Git operation is
   being tested

This is an example of how we use `GitProcess.exec` in our tests:

```ts
it('returns remotes sorted alphabetically', async () => {
  const repository = await setupEmptyRepository()

  // adding these remotes out-of-order to test how they are then retrieved
  const url = 'https://github.com/desktop/not-found.git'

  await GitProcess.exec(['remote', 'add', 'X', url], repository.path)
  await GitProcess.exec(['remote', 'add', 'A', url], repository.path)
  await GitProcess.exec(['remote', 'add', 'L', url], repository.path)
  await GitProcess.exec(['remote', 'add', 'T', url], repository.path)
  await GitProcess.exec(['remote', 'add', 'D', url], repository.path)

  const result = await getRemotes(repository)
  expect(result).toHaveLength(5)

  expect(result[0].name).toEqual('A')
  expect(result[1].name).toEqual('D')
  expect(result[2].name).toEqual('L')
  expect(result[3].name).toEqual('T')
  expect(result[4].name).toEqual('X')
})
```
