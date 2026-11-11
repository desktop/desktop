import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  commitBytes,
  count,
  rawGit,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import {
  assistantMessage,
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { PopupType } from '../../../src/models/popup'
import {
  AssistedCommitError,
  rollbackAssistedCommitTransaction,
} from '../../../src/lib/git/assisted-commit'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'

describe('AppStore assisted commit runs', () => {
  it('awaits one real selected-only commit, preserves the manual draft, and finalizes its capability', async t => {
    const source = await seed(t, {
      'selected.txt': 'before\n',
      'other.txt': 'other before\n',
    })
    await writeFile(join(source.path, 'selected.txt'), 'selected after\n')
    await writeFile(join(source.path, 'other.txt'), 'other after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const other = h
      .state(repository)
      .changesState.workingDirectory.files.find(
        file => file.path === 'other.txt'
      )
    assert.ok(other)
    await h.dispatcher.changeFileIncluded(repository, other, false)
    const draft = {
      ...DefaultCommitMessage,
      summary: 'Saved manual title',
      description: 'Saved manual body',
      timestamp: Date.now(),
    }
    await h.dispatcher.setCommitMessage(repository, draft)
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      draft
    )
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'selected.txt'),
      Buffer.from('selected after\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'other.txt'),
      Buffer.from('other before\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'other.txt'), 'utf8'),
      'other after\n'
    )
    if (result.kind === 'local-ready') {
      await assert.rejects(
        rollbackAssistedCommitTransaction(result.result),
        error =>
          error instanceof AssistedCommitError && error.code === 'disposed'
      )
    }
  })

  it('executes a complete multi-commit plan and applies trailers and sign-off to every commit', async t => {
    const source = await seed(t, {
      'one.txt': 'one before\n',
      'two.txt': 'two before\n',
    })
    await writeFile(join(source.path, 'one.txt'), 'one after\n')
    await writeFile(join(source.path, 'two.txt'), 'two after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const input = h.request(repository, {
      trailers: [
        {
          token: 'Co-Authored-By',
          value: 'Known Author <known@example.invalid>',
        },
      ],
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      input
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(h.commits.mock.callCount(), 2)
    if (result.kind === 'local-ready') {
      for (const sha of result.result.commits) {
        const message = await rawGit(repository, [
          'show',
          '-s',
          '--format=%B',
          sha,
        ])
        assert.match(
          message,
          /Co-Authored-By: Known Author <known@example.invalid>/
        )
        assert.match(message, /Signed-off-by:/)
      }
    }
    assert.strictEqual(
      await readFile(join(repository.path, 'one.txt'), 'utf8'),
      'one after\n'
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'two.txt'), 'utf8'),
      'two after\n'
    )
  })

  it('creates Empty commit without consent, credentials, a model, or manual-draft changes', async t => {
    const source = await seed(t, { 'unselected.txt': 'before\n' })
    await writeFile(join(source.path, 'unselected.txt'), 'unselected after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    await h.dispatcher.changeIncludeAllFiles(repository, false)
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    h.assisted.dialogs['lastConsent'] = null
    const draft = {
      ...DefaultCommitMessage,
      summary: 'Manual draft',
      description: 'Keep this',
      timestamp: Date.now(),
    }
    await h.dispatcher.setCommitMessage(repository, draft)
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(
      await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      'Empty commit'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.planner.createClient.mock.callCount(), 0)
    assert.strictEqual(
      h.appStore['popupManager'].areTherePopupsOfType(
        PopupType.AssistedCommitDisclaimer
      ),
      false
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      draft
    )
    assert.strictEqual(h.state(repository).allowEmptyCommit, false)
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'unselected.txt'),
      Buffer.from('before\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'unselected.txt'), 'utf8'),
      'unselected after\n'
    )
  })

  it('captures different same-file hunks exactly once while excluding an unselected hunk', async t => {
    const base = Array.from({ length: 70 }, (_, index) => `line ${index + 1}\n`)
    const source = await seed(t, { 'file.txt': base.join('') })
    const changed = [...base]
    changed[1] = 'selected first\n'
    changed[30] = 'selected second\n'
    changed[60] = 'UNSELECTED\n'
    await writeFile(join(source.path, 'file.txt'), changed.join(''))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    for (const hunk of diff.hunks.slice(0, 2)) {
      for (const [index, line] of hunk.lines.entries()) {
        if (line.isIncludeableLine()) {
          selection = selection.withLineSelection(
            hunk.unifiedDiffStart + index,
            true
          )
        }
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      assert.strictEqual(analysis.changes.length, 2)
      assert.ok(
        analysis.changes.every(change => !change.diff.includes('UNSELECTED'))
      )
      return splitResponse(analysis)
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 3)
    const expected = [...base]
    expected[1] = changed[1]
    expected[30] = changed[30]
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'file.txt'),
      Buffer.from(expected.join(''))
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      changed.join('')
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
  })

  it('uses one fresh entire-selection message for a valid but unsafe split through the real planner adapter', async t => {
    const source = await seed(t, { replaced: 'old file\n' })
    await unlink(join(source.path, 'replaced'))
    await mkdir(join(source.path, 'replaced'))
    await writeFile(join(source.path, 'replaced', 'child'), 'new child\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.restore()
    h.planner.send.mock.mockImplementation(async options => {
      const analysis = h.assisted.state['runs'].get(repository.id)?.snapshot
        ?.analysis
      assert.ok(analysis)
      const addition = analysis.changes.find(
        change => change.path === 'replaced/child'
      )
      const deletion = analysis.changes.find(
        change => change.path === 'replaced'
      )
      assert.ok(addition && deletion)
      const content =
        h.planner.send.mock.callCount() === 0
          ? {
              kind: 'plan',
              snapshotId: analysis.snapshotId,
              commits: [
                { title: 'Add child alone', changeIds: [addition.id] },
                { title: 'Delete file alone', changeIds: [deletion.id] },
              ],
            }
          : wholeSelectionResponse(
              analysis,
              'Replace old file with child directory'
            )
      assert.ok(options.prompt.includes('replaced'))
      return assistantMessage(JSON.stringify(content))
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    if (result.kind === 'error') {
      assert.fail(
        assistedCommitErrorCauses(result.error)
          .map(cause => (cause instanceof Error ? cause.stack : String(cause)))
          .join('\n')
      )
    }
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(h.planner.send.mock.callCount(), 2)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      'Replace old file with child directory'
    )
  })

  it('validates every generated message before history mutation, preserves instruction-shaped bodies, and includes sign-off in rules', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
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
      humanDescription: 'must start with feat:',
      matcher: message => message.startsWith('feat:'),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      const plan = splitResponse(analysis)
      return {
        ...plan,
        commits:
          plan.kind === 'plan'
            ? plan.commits.map((commit, index) => ({
                ...commit,
                title: index === 0 ? 'feat: first' : 'Invalid second',
              }))
            : [],
      }
    })
    const original = await tip(repository)
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 2,
      humanDescription: 'must include Signed-off-by:',
      matcher: message => message.includes('Signed-off-by:'),
    })
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const body =
      'CUSTOM instruction body\n    Preserve indentation\n\nFinal paragraph.'
    h.propose.mock.mockImplementation(async (_account, analysis) => ({
      ...wholeSelectionResponse(
        analysis,
        'feat: follow repository instructions'
      ),
      commits: [
        {
          title: 'feat: follow repository instructions',
          description: body,
          changeIds: analysis.changes.map(change => change.id),
        },
      ],
    }))
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    if (result.kind === 'error') {
      assert.fail(result.error.message)
    }
    assert.strictEqual(result.kind, 'local-ready')
    const message = await rawGit(repository, [
      'show',
      '-s',
      '--format=%B',
      'HEAD',
    ])
    assert.ok(message.includes(body))
    assert.match(message, /Signed-off-by:/)
  })
})
