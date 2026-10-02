import { ipcRenderer } from 'electron'

export function stubIPCSend(): () => void {
  const previousSend = ipcRenderer.send
  ipcRenderer.send = () => {}
  return () => {
    ipcRenderer.send = previousSend
  }
}

export function captureClipboardWrites() {
  const writes = new Array<string>()
  const previousInvoke = ipcRenderer.invoke

  ipcRenderer.invoke = async (channel: string, ...args: any[]) => {
    if (channel === 'write-clipboard-text') {
      writes.push(args[0])
      return
    }

    return previousInvoke.call(ipcRenderer, channel, ...args)
  }

  return {
    writes,
    restore() {
      ipcRenderer.invoke = previousInvoke
    },
  }
}
