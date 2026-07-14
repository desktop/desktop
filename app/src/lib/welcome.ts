import { getBoolean, setBoolean } from './local-storage'

/** The `localStorage` key for whether we've shown the Welcome flow yet. */
const HasShownWelcomeFlowKey = 'has-shown-welcome-flow'

/**
 * Check if the current user has completed the welcome flow.
 */
export function hasShownWelcomeFlow(): boolean {
  return getBoolean(HasShownWelcomeFlowKey, false)
}

/**
 * Update local storage to indicate the welcome flow has been completed.
 */
export function markWelcomeFlowComplete() {
  setBoolean(HasShownWelcomeFlowKey, true)
}
