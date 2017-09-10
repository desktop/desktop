import installExtension, {
  REACT_DEVELOPER_TOOLS,
  REACT_PERF,
} from 'electron-devtools-installer'

if (__DEV__) {
  const ready = Promise.all(
    [REACT_DEVELOPER_TOOLS, REACT_PERF].map(id => installExtension(id))
  )

  ready
    .then(names =>
      console.log(`[devtools-installer] Installed: ${names.join(', ')}`)
    )
    .catch(err =>
      console.error(
        `[devtools-installer] Failed to install devtools extension:\n${err.stack}`
      )
    )
}
