export function parseFilesToBeOverwritten(errorMessage: string) {
  const files = new Array<string>()
  const lines = errorMessage.split('\n')

  let inFilesList = false

  for (const line of lines) {
    if (inFilesList) {
      const fileLine = /^\s+(.+)$/.exec(line)
      if (fileLine === null) {
        break
      } else {
        files.push(fileLine[1].trimEnd())
      }
    } else {
      if (
        line.startsWith('error:') &&
        line.includes('files would be overwritten') &&
        line.endsWith(':')
      ) {
        inFilesList = true
      }
    }
  }

  return files
}
