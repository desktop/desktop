export function canUpdateApp() {
  return __RELEASE_CHANNEL__ === 'beta' || __RELEASE_CHANNEL__ === 'production'
}

export function getUnableToUpdateAppWarning() {
  return (
    'The application is currently running in development or test mode and ' +
    'will not receive any updates.'
  )
}
