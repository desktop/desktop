const appInfo = require('./app/app-info')

module.exports = {
  extends: './eslint-config.yml',
  // note: not using `browser` environment since it includes everything on `window`
  globals: [
    'window',
    'global',

    'performance',
    'document',
    'fetch',

    'Worker',

    'requestAnimationFrame',
    'cancelAnimationFrame',

    'requestIdleCallback',

    'localStorage',

    'log',

    // Replacements
    ...Object.keys(appInfo.getReplacements()),
    '__PROCESS_KIND__',
  ].reduce((ob, key) => {
    ob[key] = false
    return ob
  }, {}),
}
