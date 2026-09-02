import { clipboard } from 'electron'

export function captureClipboardWrites() {
  const writes = new Array<string>()
  const previousWriteText = clipboard.writeText

  clipboard.writeText = async (text: string) => {
    writes.push(text)
  }

  return {
    writes,
    restore() {
      clipboard.writeText = previousWriteText
    },
  }
}
