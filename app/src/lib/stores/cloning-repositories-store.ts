import { CloningRepository } from '../../models/cloning-repository'
import { ICloneProgress } from '../../models/progress'
import { CloneOptions } from '../../models/clone-options'
import { RetryAction, RetryActionType } from '../../models/retry-actions'

import { clone as cloneRepo } from '../git'
import { ErrorWithMetadata } from '../error-with-metadata'
import { BaseStore } from './base-store'
import { IAccessibleRepository } from '../repository-matching'

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore extends BaseStore {
  private readonly _repositories = new Array<CloningRepository>()
  private readonly stateByID = new Map<number, ICloneProgress>()
  private readonly completedAssignments = new Map<
    string,
    IAccessibleRepository | null
  >()

  /** Consume the account selected for a successfully completed clone. */
  public takeCompletedAssignment(path: string) {
    const assignment = this.completedAssignments.get(path)
    this.completedAssignments.delete(path)
    return assignment
  }

  /**
   * Clone the repository at the URL to the path.
   *
   * Returns a {Promise} which resolves to whether the clone was successful.
   */
  public async clone(
    url: string,
    path: string,
    options: CloneOptions,
    chooseAccount?: () => Promise<IAccessibleRepository | null | undefined>
  ): Promise<boolean> {
    const repository = new CloningRepository(path, url)
    this._repositories.push(repository)

    const title = `Cloning into ${path}`

    this.stateByID.set(repository.id, { kind: 'clone', title, value: 0 })
    this.emitUpdate()

    let success = true
    try {
      const assignment = await chooseAccount?.()
      if (chooseAccount !== undefined && assignment === undefined) {
        this.remove(repository)
        return false
      }
      if (assignment !== undefined) {
        options = {
          ...options,
          fallbackAccount:
            assignment === null
              ? undefined
              : {
                  endpoint: assignment.account.endpoint,
                  login: assignment.account.login,
                },
        }
      }
      await cloneRepo(url, path, options, progress => {
        this.stateByID.set(repository.id, progress)
        this.emitUpdate()
      })
      if (assignment !== undefined) {
        this.completedAssignments.set(path, assignment)
      }
    } catch (e) {
      success = false

      const retryAction: RetryAction = {
        type: RetryActionType.Clone,
        name: repository.name,
        url,
        path,
        options,
      }
      e = new ErrorWithMetadata(e, { retryAction, repository })

      this.emitError(e)
    }

    this.remove(repository)

    return success
  }

  /** Get the repositories currently being cloned. */
  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this._repositories)
  }

  /** Get the state of the repository. */
  public getRepositoryState(
    repository: CloningRepository
  ): ICloneProgress | null {
    return this.stateByID.get(repository.id) || null
  }

  /** Remove the repository. */
  public remove(repository: CloningRepository) {
    this.stateByID.delete(repository.id)

    const repoIndex = this._repositories.findIndex(r => r.id === repository.id)
    if (repoIndex > -1) {
      this._repositories.splice(repoIndex, 1)
    }

    this.emitUpdate()
  }
}
