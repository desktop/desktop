export interface IGitProgress {
  readonly title: string
  readonly value: number
  readonly total?: number
  readonly percent?: number
  readonly done: boolean
  readonly text: string
}

const percentRe = /^(\d{1,3})% \((\d+)\/(\d+)\)$/
const valueOnlyRe = /^\d+$/

// Receiving objects:  99% (166741/167587), 279.42 MiB | 2.43 MiB/s  
export function parse(line: string): IGitProgress | null {

  const titleLength = line.lastIndexOf(': ')

  if (titleLength === 0) {
    return null
  }

  if (titleLength - 2 >= line.length) {
    return null
  }

  const title = line.substr(0, titleLength)
  const progressText = line.substr(title.length + 2).trim()

  if (!progressText.length) {
    return null
  }

  const progressParts = progressText.split(', ')

  if (!progressParts.length) {
    return null
  }

  let value: number
  let total: number | undefined = undefined
  let percent: number | undefined = undefined

  // remote: Counting objects: 123
  // remote: Counting objects: 167587, done.
  if (valueOnlyRe.test(progressParts[0])) {
    value = parseInt(progressParts[0], 10)

    if (isNaN(value)) {
      return null
    }
  // Receiving objects:  99% (166741/167587), 272.10 MiB | 2.39 MiB/s   
  // Checking out files:  32% (233/728) 
  // Checking out files: 100% (728/728), done.
  } else {
    const percentMatch = percentRe.exec(progressParts[0])

    if (!percentMatch || percentMatch.length !== 4) {
      return null
    }

    percent = parseInt(percentMatch[1], 10)
    value = parseInt(percentMatch[2], 10)
    total = parseInt(percentMatch[3], 10)

    if (isNaN(percent) || isNaN(value) || isNaN(total)) {
      return null
    }
  }

  let done = false

  // We don't parse throughput at the moment so let's just loop
  // through the remaining 
  for (let i = 1; i < progressParts.length; i++) {
    if (progressParts[i] === 'done.') {
      done = true
      break
    }
  }

  return { title, value, percent, total, done, text: line }
}
