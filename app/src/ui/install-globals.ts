/** Install some globally available values for dev mode. */
export function installDevGlobals() {
  const g: any = global
  // Expose GitPerf as a global so it can be started.
  g.GitPerf = require('./lib/git-perf')

  // Expose Perf on the window so that the React Perf dev tool extension can
  // find it.
  const w: any = window
  const Perf = require('react-addons-perf')
  w.Perf = Perf
}
