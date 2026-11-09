// Used only by --smoke-test; the normal host exposes no native IPC commands.
;(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  window.addEventListener(
    'DOMContentLoaded',
    async () => {
      let bridge
      try {
        const { connect } = await import('/transport.js')
        await import('/panels.js')
        bridge = connect(token)
        await bridge.ready
        const preferences = await bridge.request('get_preferences')
        if (!preferences.theme) throw new Error('Missing preferences')
        await bridge.request('list_repositories')
        const deadline = Date.now() + 10000
        while (!document.querySelector('#management-root button')) {
          if (Date.now() > deadline) throw new Error('UI did not mount')
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        window.ipc.postMessage('desktop-smoke:ok')
      } catch {
        window.ipc.postMessage('desktop-smoke:error')
      } finally {
        bridge?.close()
      }
    },
    { once: true }
  )
})()
