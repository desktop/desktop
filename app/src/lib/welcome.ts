/** The `localStorage` key for whether we've shown the Welcome flow yet. */
const HasShownWelcomeFlowKey = 'has-shown-welcome-flow'

/**
 * Check if the current user has completed the welcome flow.
 */
export function hasShownWelcomeFlow(): boolean {
  const hasShownWelcomeFlow = localStorage.getItem(HasShownWelcomeFlowKey)
  if (!hasShownWelcomeFlow) {
    return false
  }

  const value = parseInt(hasShownWelcomeFlow, 10)
  return value === 1
}

/**
 * Update local storage to indicate the welcome flow has been completed.
 */
export function markWelcomeFlowComplete() {
  localStorage.setItem(HasShownWelcomeFlowKey, '1')
}
