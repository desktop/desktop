import * as React from 'react'

import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { API, APIRepoRuleType, IAPIRepoRuleset } from '../../lib/api'
import { Account } from '../../models/account'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { parseRepoRules, useRepoRulesLogic } from '../../lib/helpers/repo-rules'
import { InputError } from './input-description/input-error'
import { InputWarning } from './input-description/input-warning'
import { Row } from './row'

/** The result of a branch name rule check. */
export interface IBranchRuleError {
  readonly error: Error
  readonly isWarning: boolean
}

/**
 * Checks repo rules to see if the provided branch name is valid for the
 * current user and repository. The "get all rules for a branch" endpoint
 * is called first, and if a "creation" or "branch name" rule is found,
 * then those rulesets are checked to see if the current user can bypass
 * them.
 *
 * Returns `null` if the branch name passes all rules or if validation
 * cannot be performed (e.g. no accounts, non-GitHub repo).
 */
export async function checkBranchNameRules(
  branchName: string,
  accounts: ReadonlyArray<Account>,
  repository: Repository,
  cachedRepoRulesets: ReadonlyMap<number, IAPIRepoRuleset>
): Promise<IBranchRuleError | null> {
  if (
    accounts.length === 0 ||
    !isRepositoryWithGitHubRepository(repository) ||
    branchName === ''
  ) {
    return null
  }

  const account = getAccountForRepository(accounts, repository)

  if (account === null || !useRepoRulesLogic(account, repository)) {
    return null
  }

  const api = API.fromAccount(account)
  const branchRules = await api.fetchRepoRulesForBranch(
    repository.gitHubRepository.owner.login,
    repository.gitHubRepository.name,
    branchName
  )

  // filter the rules to only the relevant ones and get their IDs. use a Set to dedupe.
  const toCheck = new Set(
    branchRules
      .filter(
        r =>
          r.type === APIRepoRuleType.Creation ||
          r.type === APIRepoRuleType.BranchNamePattern
      )
      .map(r => r.ruleset_id)
  )

  // there are no relevant rules for this branch name
  if (toCheck.size === 0) {
    return null
  }

  // check for actual failures
  const { branchNamePatterns, creationRestricted } = await parseRepoRules(
    branchRules,
    cachedRepoRulesets,
    repository
  )

  const { status } = branchNamePatterns.getFailedRules(branchName)

  if (creationRestricted !== true && status === 'pass') {
    return null
  }

  // check cached rulesets to see which ones the user can bypass
  let cannotBypass = false
  for (const id of toCheck) {
    const rs = cachedRepoRulesets.get(id)

    if (rs?.current_user_can_bypass !== 'always') {
      cannotBypass = true
      break
    }
  }

  if (cannotBypass) {
    return {
      error: new Error(
        `Branch name '${branchName}' is restricted by repo rules.`
      ),
      isWarning: false,
    }
  }

  return {
    error: new Error(
      `Branch name '${branchName}' is restricted by repo rules, but you can bypass them. Proceed with caution!`
    ),
    isWarning: true,
  }
}

/**
 * Renders an error or warning row for branch name rule violations.
 * Returns `null` if there is no error.
 */
export function renderBranchNameRuleError(
  currentError: IBranchRuleError | null,
  errorsId: string,
  trackedUserInput: string
): React.ReactElement | null {
  if (currentError === null) {
    return null
  }

  if (currentError.isWarning) {
    return (
      <Row>
        <InputWarning id={errorsId} trackedUserInput={trackedUserInput}>
          {currentError.error.message}
        </InputWarning>
      </Row>
    )
  }

  return (
    <Row>
      <InputError id={errorsId} trackedUserInput={trackedUserInput}>
        {currentError.error.message}
      </InputError>
    </Row>
  )
}
