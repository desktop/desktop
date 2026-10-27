import { PopupType } from '../../models/popup'
import { Repository } from '../../models/repository'
import { HookProgress, TerminalOutput } from '../git'
import { getNumber, setNumber } from '../local-storage'
import { offsetFromNow } from '../offset-from'
import { PopupManager } from '../popup-manager'
import { AssistedCommitState } from './state'
import { IAssistedCommitHookFailure, IAssistedCommitRun } from './types'

const assistedCommitDisclaimerLastSeenKey =
  'assisted-commit-disclaimer-last-seen'

/** Owns consent and the single native hook-failure queue across commit paths. */
export class AssistedCommitDialogs {
  private lastConsent: number | null = null
  private readonly hookFailures = new Set<IAssistedCommitHookFailure>()

  public constructor(
    private readonly state: AssistedCommitState,
    private readonly popupManager: PopupManager
  ) {}

  /** Load existing consent without sharing ordinary message-generation consent. */
  public loadConsent(): void {
    this.lastConsent = getNumber(assistedCommitDisclaimerLastSeenKey) ?? null
  }

  /** Assisted consent expires independently of ordinary generation consent. */
  public isConsentFresh(): boolean {
    return (
      this.lastConsent !== null &&
      offsetFromNow(-30, 'days') <= this.lastConsent
    )
  }

  /** Request consent without letting cancellation dismiss another owner's popup. */
  public requestConsent(run: IAssistedCommitRun): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const complete = (accepted: boolean) => {
        const consent = run.consent
        if (consent === undefined) {
          return
        }
        run.consent = undefined
        if (consent.popupId !== undefined) {
          this.popupManager.removePopupById(consent.popupId)
        }
        run.controller.signal.removeEventListener('abort', onAbort)
        if (accepted) {
          this.lastConsent = Date.now()
          setNumber(assistedCommitDisclaimerLastSeenKey, this.lastConsent)
        }
        resolve(accepted)
        this.state.events.changed()
      }
      const onAbort = () => complete(false)
      run.consent = { resolve: complete }
      run.controller.signal.addEventListener('abort', onAbort, { once: true })
      if (run.controller.signal.aborted) {
        complete(false)
        return
      }
      this.state.set(run, {
        kind: 'awaiting-consent',
        runId: run.id,
        cancelRequested: false,
      })
      if (run.consent === undefined) {
        return
      }
      if (
        this.popupManager.areTherePopupsOfType(
          PopupType.AssistedCommitDisclaimer
        )
      ) {
        complete(false)
        return
      }
      const popup = this.popupManager.addPopup({
        type: PopupType.AssistedCommitDisclaimer,
        repository: run.repository,
        onAccepted: () => complete(true),
      })
      if (popup.id === undefined) {
        throw new Error('Could not open the assisted commit disclaimer')
      }
      run.consent = { popupId: popup.id, resolve: complete }
      this.state.events.changed()
    })
  }

  /** Queue the current ignorable failure; Ignore never bypasses later hooks. */
  public requestHookFailure(
    run: IAssistedCommitRun,
    hookName: string,
    terminalOutput: TerminalOutput
  ): Promise<'abort' | 'ignore'> {
    if (run.controller.signal.aborted) {
      return Promise.resolve('abort')
    }
    return new Promise(resolve => {
      const complete = (resolution: 'abort' | 'ignore') => {
        const failure = ownedFailure
        if (!this.hookFailures.delete(failure)) {
          return
        }
        if (run.hookFailure === failure) {
          run.hookFailure = undefined
        }
        run.controller.signal.removeEventListener('abort', abort)
        if (failure.popupId !== undefined) {
          this.popupManager.removePopupById(failure.popupId)
        }
        resolve(resolution)
        this.presentNextFailure()
        this.state.events.changed()
      }
      const abort = () => complete('abort')
      const ownedFailure: NonNullable<IAssistedCommitRun['hookFailure']> = {
        resolve: complete,
        present: () => {
          const popup = this.popupManager.addPopup({
            type: PopupType.HookFailed,
            hookName,
            terminalOutput,
            resolve: complete,
          })
          if (popup.id === undefined) {
            complete('abort')
            return
          }
          ownedFailure.popupId = popup.id
          this.state.events.changed()
        },
      }
      run.hookFailure = ownedFailure
      run.controller.signal.addEventListener('abort', abort, { once: true })
      this.hookFailures.add(ownedFailure)
      this.presentNextFailure()
    })
  }

  /** Present at most one owner-aware native hook failure across commit paths. */
  public presentNextFailure(): void {
    if (this.popupManager.areTherePopupsOfType(PopupType.HookFailed)) {
      return
    }
    const next = [...this.hookFailures].find(
      failure => failure.popupId === undefined
    )
    next?.present()
  }

  /** Dialog dismissal resolves only matching consent or failure identities. */
  public settleDismissed(popupId: number | undefined): void {
    if (popupId === undefined) {
      return
    }
    for (const run of this.state.runs.values()) {
      if (run.consent?.popupId === popupId) {
        run.consent.resolve(false)
      }
    }
    for (const failure of this.hookFailures) {
      if (failure.popupId === popupId) {
        failure.resolve('abort')
      }
    }
    this.presentNextFailure()
  }

  /** Publish native hook progress through the repository's existing UI fields. */
  public hookProgress = (respository: Repository) => {
    return (hookProgress: HookProgress) => {
      this.state.cache.update(respository, () => ({ hookProgress }))
      this.state.events.changed()
    }
  }

  /** Ordinary commits and pulls use the same failure queue, not assisted run state. */
  public ordinaryHookFailure = (onAborted: () => void) => {
    return (hookName: string, terminalOutput: TerminalOutput) =>
      new Promise<'abort' | 'ignore'>(resolve => {
        const failure: NonNullable<IAssistedCommitRun['hookFailure']> = {
          present: () => {
            const popup = this.popupManager.addPopup({
              type: PopupType.HookFailed,
              hookName,
              terminalOutput,
              resolve: failure.resolve,
            })
            if (popup.id === undefined) {
              throw new Error('Could not open the commit hook failure dialog')
            }
            failure.popupId = popup.id
            this.state.events.changed()
          },
          resolve: resolution => {
            if (!this.hookFailures.delete(failure)) {
              return
            }
            if (failure.popupId !== undefined) {
              this.popupManager.removePopupById(failure.popupId)
            }
            if (resolution === 'abort') {
              onAborted()
            }
            resolve(resolution)
            this.presentNextFailure()
            this.state.events.changed()
          },
        }
        this.hookFailures.add(failure)
        this.presentNextFailure()
      })
  }
}
