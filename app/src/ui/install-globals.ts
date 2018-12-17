/** Install some globally available values for dev mode. */
export function installDevGlobals() {
  const g: any = global
  // Expose GitPerf as a global so it can be started.
  g.GitPerf = require('./lib/git-perf')
}
