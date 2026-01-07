import { git, parseCommitSHA, GitError } from './core'
import { stageFiles } from './update-index'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { unstageAll } from './reset'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { stageManualConflictResolution } from './stage'
import { GitError as DugiteError } from 'dugite'
import { trampolineUIHelper } from '../trampoline/trampoline-ui-helper'
import {
  setGPGPassphrase,
  setMostRecentGPGPassphrase,
} from '../gpg/gpg-passphrase'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

/**
 * @param repository repository to execute merge in
 * @param message commit message
 * @param files files to commit
 * @returns the commit SHA
 */
export async function createCommit(
  repository: Repository,
  message: string,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  amend: boolean = false
): Promise<string> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  await unstageAll(repository)

  await stageFiles(repository, files)

  const args = ['-F', '-']

  if (amend) {
    args.push('--amend')
  }

  try {
    const result = await git(
      ['commit', ...args],
      repository.path,
      'createCommit',
      {
        stdin: message,
      }
    )
    return parseCommitSHA(result)
  } catch (error) {
    // Handle GPG signing failures by prompting for passphrase
    if (
      error instanceof GitError &&
      error.result.gitError === DugiteError.GPGFailedToSignData
    ) {
      // Extract GPG key ID from error message if possible
      const keyIdMatch = /gpg: signing failed: .*(0x[0-9A-Fa-f]+)/i.exec(
        error.message
      )
      const keyId = keyIdMatch ? keyIdMatch[1] : 'default'

      // Prompt user for GPG passphrase
      const { secret: passphrase, storeSecret: storePassphrase } =
        await trampolineUIHelper.promptGPGPassphrase(keyId)

      if (passphrase) {
        // Store the passphrase if user requested it
        if (storePassphrase) {
          await setGPGPassphrase('manual-gpg-prompt', keyId, passphrase)
        }

        // Also store for immediate use with a temporary token
        await setGPGPassphrase('temp-retry-token', keyId, passphrase)
        await setMostRecentGPGPassphrase('temp-retry-token', keyId)

        // Retry the commit operation by creating a temporary passphrase file
        // and a temporary GPG wrapper script
        const tempPassphraseFile = path.join(
          os.tmpdir(),
          `gpg-passphrase-${Date.now()}.tmp`
        )
        const tempGPGWrapper = path.join(
          os.tmpdir(),
          `gpg-wrapper-${Date.now()}.bat`
        )

        try {
          // Write passphrase to temporary file
          await fs.writeFile(tempPassphraseFile, passphrase, { mode: 0o600 })

          // Create a temporary GPG wrapper batch file
          const wrapperContent = `@echo off\n"C:\\Program Files\\Git\\usr\\bin\\gpg.exe" --pinentry-mode loopback --passphrase-file "${tempPassphraseFile}" %*`
          await fs.writeFile(tempGPGWrapper, wrapperContent)

          const result = await git(
            ['-c', `gpg.program=${tempGPGWrapper}`, 'commit', ...args],
            repository.path,
            'createCommit',
            {
              stdin: message,
            }
          )

          return parseCommitSHA(result)
        } finally {
          // Clean up temporary files
          try {
            await fs.access(tempPassphraseFile)
            await fs.unlink(tempPassphraseFile)
          } catch (e) {
            // Silently ignore cleanup errors
          }

          try {
            await fs.access(tempGPGWrapper)
            await fs.unlink(tempGPGWrapper)
          } catch (e) {
            // Silently ignore cleanup errors
          }
        }
      }
    }

    throw error
  }
}

/**
 * Creates a commit to finish an in-progress merge
 * assumes that all conflicts have already been resolved
 * *Warning:* Does _not_ clear staged files before it commits!
 *
 * @param repository repository to execute merge in
 * @param files files to commit
 */
export async function createMergeCommit(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution> = new Map()
): Promise<string> {
  // apply manual conflict resolutions
  for (const [path, resolution] of manualResolutions) {
    const file = files.find(f => f.path === path)
    if (file !== undefined) {
      await stageManualConflictResolution(repository, file, resolution)
    } else {
      log.error(
        `couldn't find file ${path} even though there's a manual resolution for it`
      )
    }
  }

  const otherFiles = files.filter(f => !manualResolutions.has(f.path))

  await stageFiles(repository, otherFiles)

  const commitArgs = [
    'commit',
    // no-edit here ensures the app does not accidentally invoke the user's editor
    '--no-edit',
    // By default Git merge commits do not contain any commentary (which
    // are lines prefixed with `#`). This works because the Git CLI will
    // prompt the user to edit the file in `.git/COMMIT_MSG` before
    // committing, and then it will run `--cleanup=strip`.
    //
    // This clashes with our use of `--no-edit` above as Git will now change
    // it's behavior to invoke `--cleanup=whitespace` as it did not ask
    // the user to edit the COMMIT_MSG as part of creating a commit.
    //
    // From the docs on git-commit (https://git-scm.com/docs/git-commit) I'll
    // quote the relevant section:
    // --cleanup=<mode>
    //     strip
    //        Strip leading and trailing empty lines, trailing whitespace,
    //        commentary and collapse consecutive empty lines.
    //     whitespace
    //        Same as `strip` except #commentary is not removed.
    //     default
    //        Same as `strip` if the message is to be edited. Otherwise `whitespace`.
    //
    // We should emulate the behavior in this situation because we don't
    // let the user view or change the commit message before making the
    // commit.
    '--cleanup=strip',
  ]

  try {
    const result = await git(commitArgs, repository.path, 'createMergeCommit')
    return parseCommitSHA(result)
  } catch (error) {
    // Handle GPG signing failures by prompting for passphrase
    if (
      error instanceof GitError &&
      error.result.gitError === DugiteError.GPGFailedToSignData
    ) {
      // Extract GPG key ID from error message if possible
      const keyIdMatch = /gpg: signing failed: .*(0x[0-9A-Fa-f]+)/i.exec(
        error.message
      )
      const keyId = keyIdMatch ? keyIdMatch[1] : 'default'

      // Prompt user for GPG passphrase
      const { secret: passphrase, storeSecret: storePassphrase } =
        await trampolineUIHelper.promptGPGPassphrase(keyId)

      if (passphrase) {
        // Store the passphrase if user requested it
        if (storePassphrase) {
          await setGPGPassphrase('manual-gpg-merge-prompt', keyId, passphrase)
        }

        // Retry the commit operation
        const result = await git(
          commitArgs,
          repository.path,
          'createMergeCommit'
        )
        return parseCommitSHA(result)
      }
    }

    throw error
  }
}
