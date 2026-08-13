import { open, type Entry, type ZipFile } from 'yauzl'

export async function validateWindowsPackage(
  packagePath: string,
  executableName: string,
  requireExecutable: boolean = true
): Promise<void> {
  const entries = await readEntries(packagePath)
  const names = new Set<string>()
  const executablePath = `lib/net45/${executableName}`

  for (const entry of entries) {
    if (names.has(entry.fileName)) {
      throw new Error(`Package contains duplicate entry: ${entry.fileName}`)
    }

    names.add(entry.fileName)
  }

  if (requireExecutable && !names.has(executablePath)) {
    throw new Error(
      `Package is missing its application executable: ${executablePath}`
    )
  }
}

function readEntries(packagePath: string): Promise<ReadonlyArray<Entry>> {
  return new Promise((resolve, reject) => {
    open(packagePath, { lazyEntries: true }, (error, zipFile) => {
      if (error !== null || zipFile === undefined) {
        reject(error ?? new Error(`Unable to open package: ${packagePath}`))
        return
      }

      collectEntries(zipFile).then(resolve, reject)
    })
  })
}

async function collectEntries(zipFile: ZipFile): Promise<ReadonlyArray<Entry>> {
  const entries: Array<Entry> = []

  try {
    for await (const entry of entriesFrom(zipFile)) {
      entries.push(entry)
    }
  } finally {
    zipFile.close()
  }

  return entries
}

async function* entriesFrom(zipFile: ZipFile): AsyncGenerator<Entry> {
  let nextEntry: Entry | undefined

  while (true) {
    nextEntry = await readEntry(zipFile)

    if (nextEntry === undefined) {
      return
    }

    await consumeEntry(zipFile, nextEntry)
    yield nextEntry
  }
}

function readEntry(zipFile: ZipFile): Promise<Entry | undefined> {
  return new Promise((resolve, reject) => {
    const onEntry = (entry: Entry) => {
      zipFile.removeListener('end', onEnd)
      resolve(entry)
    }
    const onEnd = () => {
      zipFile.removeListener('entry', onEntry)
      resolve(undefined)
    }

    zipFile.once('entry', onEntry)
    zipFile.once('end', onEnd)
    zipFile.once('error', reject)
    zipFile.readEntry()
  })
}

function consumeEntry(zipFile: ZipFile, entry: Entry): Promise<void> {
  if (/\/$/.test(entry.fileName)) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === undefined) {
        reject(
          error ?? new Error(`Unable to read package entry: ${entry.fileName}`)
        )
        return
      }

      stream.on('error', reject)
      stream.on('end', resolve)
      stream.resume()
    })
  })
}
