/**
 * Hack: The file-metadata plugin has substantial dependencies
 * (plist, DOMParser, etc) and it's only applicable on macOS.
 *
 * Therefore, when compiling on other platforms, we replace it
 * with this tiny shim. See webpack.common.ts.
 */
module.exports = () => Promise.resolve({})
