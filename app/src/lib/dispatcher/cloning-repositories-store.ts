import * as Path from 'path'

import { Emitter, Disposable } from 'event-kit'

import { LocalGitOperations } from '../local-git-operations'

let CloningRepositoryID = 1

/** A repository which is currently being cloned. */
export class CloningRepository {
  public readonly id = CloningRepositoryID++
  public readonly path: string
  public readonly url: string

  public constructor(path: string, url: string) {
    this.path = path
    this.url = url
  }

  public get name(): string {
    return Path.basename(this.path)
  }
}

/** The cloning progress of a repository. */
export interface ICloningRepositoryState {
  /** The raw progress output from the clone task. */
  readonly output: string,

  /**
   * A value between 0 and 1 indicating the clone progress.
   *
   * A missing value indicates that the current progress is
   * indeterminate. This value may loop from 0 to 1 several
   * times during a clone, in other words, this is not an
   * accurate representation of the entire clone process but
   * rather progress of the individual steps (fetch, deltas,
   * checkout). This is subject to change.
   */
  readonly progressValue?: number
}

/** The store in charge of repository currently being cloned. */
export class CloningRepositoriesStore {
  private readonly emitter = new Emitter()

  private readonly _repositories = new Array<CloningRepository>()
  private readonly stateByID = new Map<number, ICloningRepositoryState>()

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Clone the repository at the URL to the path. */
  public clone(url: string, path: string): Promise<void> {
    const repository = new CloningRepository(path, url)
    this._repositories.push(repository)
    this.stateByID.set(repository.id, { output: `Cloning into ${path}` })

    /* Highly approximate (some would say outright innacurate) division
     * of the individual progress reporting steps in a clone operation
     */
    const costsByStep = [
      { expr: /remote: Compressing objects:\s+(\d+)%/, cost: 0.1 },
      { expr: /Receiving objects:\s+(\d+)%/, cost: 0.7 },
      { expr: /Resolving deltas:\s+(\d+)%/, cost: 0.1 },
      { expr: /Checking out files:\s+(\d+)%/, cost: 0.09 },
    ]

    /* The steps listed in costsByStep always occur in order but some
     * might not happen at all (like remote compression of objects) so
     * we keep track of the "highest" seen step so that we can fill in
     * progress with the assumption that we've already seen the previous
     * steps. Null means that we haven't seen anything matching our
     * regular expressions yet.
     */
    let highestSeenStep: number | null = null

    const promise = LocalGitOperations
      .clone(url, path, progress => {

        /* The accumulated progress, 0 to 1. Null means indeterminate */
        let progressValue = highestSeenStep == null ? null : 0

        /* Add add up the progress from steps we've already "seen" */
        if (highestSeenStep != null) {
          for (let i = 0; i < highestSeenStep; i++) {
            progressValue += costsByStep[i].cost
          }
        }

        /* Iterate over the steps we haven't seen yet and try to find
         * one that matches
         */
        for (let i = highestSeenStep || 0; i < costsByStep.length; i++) {
          const step = costsByStep[i]
          const match = step.expr.exec(progress)

          if (match != null) {
            highestSeenStep = i
            progressValue += (parseInt(match[1], 10) / 100) * step.cost
            break
          }
        }

        if (progressValue != null) {
          this.stateByID.set(repository.id, { output: progress, progressValue })
        } else {
          this.stateByID.set(repository.id, { output: progress })
        }

        this.emitUpdate()
      })
      .then(() => {
        this.remove(repository)
      })

    this.emitUpdate()

    return promise
  }

  /** Get the repositories currently being cloned. */
  public get repositories(): ReadonlyArray<CloningRepository> {
    return Array.from(this._repositories)
  }

  /** Get the state of the repository. */
  public getRepositoryState(repository: CloningRepository): ICloningRepositoryState | null {
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
