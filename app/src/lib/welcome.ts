/** The `localStorage` key for whether we've shown the Welcome flow yet. */
const HasShownWelcomeFlowKey = 'has-shown-welcome-flow'

export function hasShownWelcomeFlow(): boolean {
  const hasShownWelcomeFlow = localStorage.getItem(HasShownWelcomeFlowKey)
  return !hasShownWelcomeFlow || !parseInt(hasShownWelcomeFlow, 10)
}

export function markWelcomeFlowComplete() {
  localStorage.setItem(HasShownWelcomeFlowKey, '1')
}
