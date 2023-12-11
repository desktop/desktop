// See:
// - https://github.com/microsoft/accessibility-insights-web/pull/5421#issuecomment-1109168149
// - https://github.com/microsoft/accessibility-insights-web/blob/9ad4e618019298d82732d49d00aafb846fb6bac7/src/tests/common/resolver.js

const shouldRevertToCjs = pkg => {
  if (pkg.name === 'dexie') {
    return true
  } else if (pkg.name === 'uuid' && pkg.version.startsWith('8.')) {
    return true
  }
}

module.exports = (path, options) => {
  return options.defaultResolver(path, {
    ...options,
    packageFilter: pkg => {
      if (shouldRevertToCjs(pkg)) {
        delete pkg['exports']
        delete pkg['module']
      }
      return pkg
    },
  })
}
