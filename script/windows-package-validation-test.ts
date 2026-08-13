import assert from 'node:assert'
import { test } from 'node:test'
import { createWriteStream } from 'fs'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { validateWindowsPackage } from './windows-package-validation'

const executableName = 'GitHubDesktop.exe'

async function createPackage(
  entries: ReadonlyArray<{ path: string; contents: string }>
) {
  const directory = await mkdtemp(join(tmpdir(), 'windows-package-validation-'))
  const packagePath = join(directory, 'package.nupkg')
  const zipEntries = entries.map(entry =>
    createZipEntry(entry.path, entry.contents)
  )
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(packagePath)
    stream.on('close', resolve)
    stream.on('error', reject)
    stream.end(
      Buffer.concat([
        ...zipEntries.map(entry => entry.data),
        createEndOfCentralDirectory(zipEntries),
      ])
    )
  })

  return { directory, packagePath }
}

function createZipEntry(path: string, contents: string) {
  const fileName = Buffer.from(path)
  const data = Buffer.from(contents)
  const header = Buffer.alloc(30 + fileName.length)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(crc32(data), 14)
  header.writeUInt32LE(data.length, 18)
  header.writeUInt32LE(data.length, 22)
  header.writeUInt16LE(fileName.length, 26)
  fileName.copy(header, 30)

  const centralHeader = Buffer.alloc(46 + fileName.length)
  centralHeader.writeUInt32LE(0x02014b50, 0)
  centralHeader.writeUInt16LE(20, 4)
  centralHeader.writeUInt16LE(20, 6)
  centralHeader.writeUInt16LE(0, 8)
  centralHeader.writeUInt16LE(0, 10)
  centralHeader.writeUInt16LE(0, 12)
  centralHeader.writeUInt16LE(0, 14)
  centralHeader.writeUInt32LE(crc32(data), 16)
  centralHeader.writeUInt32LE(data.length, 20)
  centralHeader.writeUInt32LE(data.length, 24)
  centralHeader.writeUInt16LE(fileName.length, 28)
  fileName.copy(centralHeader, 46)

  return { data: Buffer.concat([header, data]), centralHeader }
}

function createEndOfCentralDirectory(
  entries: ReadonlyArray<{ data: Buffer; centralHeader: Buffer }>
) {
  const centralDirectory = Buffer.concat(
    entries.map(entry => entry.centralHeader)
  )
  const offset = entries.reduce((size, entry) => size + entry.data.length, 0)
  const footer = Buffer.alloc(22)
  footer.writeUInt32LE(0x06054b50, 0)
  footer.writeUInt16LE(entries.length, 8)
  footer.writeUInt16LE(entries.length, 10)
  footer.writeUInt32LE(centralDirectory.length, 12)
  footer.writeUInt32LE(offset, 16)

  return Buffer.concat([centralDirectory, footer])
}

function crc32(data: Buffer) {
  let value = 0xffffffff

  for (const byte of data) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
    }
  }

  return (value ^ 0xffffffff) >>> 0
}

test('accepts a complete Windows package', async () => {
  const packageData = await createPackage([
    { path: `lib/net45/${executableName}`, contents: 'executable' },
    { path: 'lib/net45/resources.pak', contents: 'resources' },
  ])

  try {
    await validateWindowsPackage(packageData.packagePath, executableName)
  } finally {
    await rm(packageData.directory, { recursive: true, force: true })
  }
})

test('rejects a package with duplicate entries', async () => {
  const packageData = await createPackage([
    { path: `lib/net45/${executableName}`, contents: 'first' },
    { path: `lib/net45/${executableName}`, contents: 'second' },
  ])

  try {
    await assert.rejects(
      validateWindowsPackage(packageData.packagePath, executableName),
      /duplicate entry/
    )
  } finally {
    await rm(packageData.directory, { recursive: true, force: true })
  }
})

test('rejects a package missing the application executable', async () => {
  const packageData = await createPackage([
    { path: 'lib/net45/resources.pak', contents: 'resources' },
  ])

  try {
    await assert.rejects(
      validateWindowsPackage(packageData.packagePath, executableName),
      /missing its application executable/
    )
  } finally {
    await rm(packageData.directory, { recursive: true, force: true })
  }
})

test('rejects a truncated package', async () => {
  const packageData = await createPackage([
    { path: `lib/net45/${executableName}`, contents: 'executable' },
  ])

  try {
    const contents = await readFile(packageData.packagePath)
    await writeFile(packageData.packagePath, contents.subarray(0, -1))

    await assert.rejects(
      validateWindowsPackage(packageData.packagePath, executableName)
    )
  } finally {
    await rm(packageData.directory, { recursive: true, force: true })
  }
})
