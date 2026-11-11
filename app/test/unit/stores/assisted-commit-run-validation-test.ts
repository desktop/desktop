import { isolateGitConfig } from '../../helpers/git-config'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  count,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
} from '../../helpers/assisted-commit'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { PopupType } from '../../../src/models/popup'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'

describe('AppStore assisted commit first-click and message validation', () => {
  it('rejects captured branch identity changed to another ref at the same commit', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.dialogs['lastConsent'] = null
    const shown = deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.appStore['popupManager'].currentPopup?.type ===
        PopupType.AssistedCommitDisclaimer
      ) {
        shown.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await shown.promise
    await rawGit(repository, ['switch', '-c', 'different'])
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('rejects new selected content introduced while snapshot capture is starting', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'first selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const progress = h.assisted.context['progress'].bind(h.assisted.context)
    h.assisted.context['progress'] = async (run, step) => {
      progress(run, step)
      if (step.kind === 'capturing') {
        await writeFile(
          join(repository.path, 'file'),
          'new unauthorized content\n'
        )
      }
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  for (const changed of ['content', 'branch'] as const) {
    it(`rejects first-click intent after ${changed} changes while a warning is open`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'original selected content\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const prepared = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      if (changed === 'content') {
        await writeFile(
          join(repository.path, 'file'),
          'replacement selected content\n'
        )
      } else {
        await rawGit(repository, ['switch', '-c', 'warning-changed-branch'])
        await h.appStore._loadStatus(repository)
      }
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        prepared
      )
      assert.strictEqual(outcome.kind, 'error')
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('validates sign-off against frozen execution configuration, not a changed live committer', async t => {
    await isolateGitConfig(t)
    const source = await seed(t, { file: 'before\n' })
    await rawGit(source, ['config', '--local', 'user.name', 'Original Signer'])
    await rawGit(source, [
      'config',
      '--local',
      'user.email',
      'original@example.invalid',
    ])
    const previousName = process.env.GIT_COMMITTER_NAME
    const previousEmail = process.env.GIT_COMMITTER_EMAIL
    delete process.env.GIT_COMMITTER_NAME
    delete process.env.GIT_COMMITTER_EMAIL
    t.after(() => {
      if (previousName === undefined) {
        delete process.env.GIT_COMMITTER_NAME
      } else {
        process.env.GIT_COMMITTER_NAME = previousName
      }
      if (previousEmail === undefined) {
        delete process.env.GIT_COMMITTER_EMAIL
      } else {
        process.env.GIT_COMMITTER_EMAIL = previousEmail
      }
    })
    assert.match(
      await rawGit(source, ['var', 'GIT_COMMITTER_IDENT']),
      /^Original Signer <original@example\.invalid>/
    )
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
    )
    const repository = new Repository(
      local.path,
      local.id,
      github,
      false,
      null,
      {},
      false,
      local.gitDir,
      local.mainWorktreePath,
      h.appStore['accounts'][0].login
    )
    h.appStore['adoptRepository'](repository)
    await h.appStore._loadStatus(repository)
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const rules = new RepoRulesInfo()
    const checkedMessages: string[] = []
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'requires changed signer',
      matcher: message => {
        checkedMessages.push(message)
        return message.includes(
          'Signed-off-by: Changed Signer <changed@example.invalid>'
        )
      },
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await rawGit(repository, ['config', 'user.name', 'Changed Signer'])
      await rawGit(repository, [
        'config',
        'user.email',
        'changed@example.invalid',
      ])
      return wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.ok(checkedMessages.length > 0)
    for (const message of checkedMessages) {
      assert.match(
        message,
        /Signed-off-by: Original Signer <original@example\.invalid>/
      )
      assert.doesNotMatch(message, /Changed Signer/)
    }
    assert.match(
      await rawGit(repository, ['var', 'GIT_COMMITTER_IDENT']),
      /^Changed Signer <changed@example\.invalid>/
    )
  })

  it('validates native body-less messages without fabricating a blank separator', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
    )
    const repository = new Repository(
      local.path,
      local.id,
      github,
      false,
      null,
      {},
      false,
      local.gitDir,
      local.mainWorktreePath,
      h.appStore['accounts'][0].login
    )
    h.appStore['adoptRepository'](repository)
    await h.appStore._loadStatus(repository)
    const rules = new RepoRulesInfo()
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'exact body-less title',
      matcher: message => /^feat: test\n?$/.test(message),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      wholeSelectionResponse(analysis, 'feat: test')
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.strictEqual(await count(repository), 2)
  })

  it('validates native sign-off even when configurable interpret-trailers would drop it', async t => {
    const source = await seed(t, { file: 'before\n' })
    await rawGit(source, ['config', 'trailer.ifMissing', 'doNothing'])
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
    )
    const repository = new Repository(
      local.path,
      local.id,
      github,
      false,
      null,
      {},
      false,
      local.gitDir,
      local.mainWorktreePath,
      h.appStore['accounts'][0].login
    )
    h.appStore['adoptRepository'](repository)
    await h.appStore._loadStatus(repository)
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const rules = new RepoRulesInfo()
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'requires sign-off',
      matcher: message => message.includes('Signed-off-by:'),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.match(
      await rawGit(repository, ['show', '-s', '--format=%B', 'HEAD']),
      /Signed-off-by:/
    )
  })

  it('rejects frozen committer-email rules before any assisted history mutation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
    )
    const repository = new Repository(
      local.path,
      local.id,
      github,
      false,
      null,
      {},
      false,
      local.gitDir,
      local.mainWorktreePath,
      h.appStore['accounts'][0].login
    )
    h.appStore['adoptRepository'](repository)
    await h.appStore._loadStatus(repository)
    const rules = new RepoRulesInfo()
    rules.committerEmailPatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'denies this committer',
      matcher: () => false,
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    const index = await optionalBytes(await indexPath(repository))
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    if (outcome.kind === 'error') {
      assert.match(outcome.error.message, /committer/)
    }
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      index
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })
})
