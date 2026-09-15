import type {
  SessionFsConfig,
  SessionFsFileInfo,
  SessionFsProvider,
} from '@github/copilot-sdk'
import { posix, win32 } from 'path'

const InMemorySessionFsStatePath = 'state'
type CopilotInMemorySessionFsReaddirWithTypesEntry = Awaited<
  ReturnType<SessionFsProvider['readdirWithTypes']>
>[number]

function normalizeCopilotInMemorySessionFsInitialCwd(
  path: string,
  conventions: SessionFsConfig['conventions']
) {
  if (conventions === 'windows') {
    return win32.normalize(path)
  }

  const pathWithPosixSeparators = path.replace(/\\/g, '/')
  const windowsDrivePath = /^([A-Za-z]):(?:\/(.*))?$/.exec(
    pathWithPosixSeparators
  )

  if (windowsDrivePath === null) {
    return pathWithPosixSeparators
  }

  const [, driveLetter, pathWithoutDrive = ''] = windowsDrivePath
  return posix.join('/', driveLetter.toLowerCase(), pathWithoutDrive)
}

export function getCopilotInMemorySessionFsConfig(
  repositoryPath: string | undefined,
  conventions: SessionFsConfig['conventions']
): SessionFsConfig {
  return {
    initialCwd: normalizeCopilotInMemorySessionFsInitialCwd(
      repositoryPath ?? process.cwd(),
      conventions
    ),
    sessionStatePath: InMemorySessionFsStatePath,
    conventions,
  }
}

interface ICopilotInMemorySessionFsFile {
  readonly content: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface ICopilotInMemorySessionFsDirectory {
  readonly createdAt: string
  readonly updatedAt: string
}

type CopilotInMemorySessionFsErrorCode =
  | 'EEXIST'
  | 'EISDIR'
  | 'EINVAL'
  | 'ENOENT'

function createCopilotInMemorySessionFsError(
  path: string,
  code: CopilotInMemorySessionFsErrorCode = 'ENOENT'
): Error {
  return Object.assign(new Error(`${code}: ${path}`), { code })
}

export function createCopilotInMemorySessionFsProvider(): SessionFsProvider {
  const files = new Map<string, ICopilotInMemorySessionFsFile>()
  const timestamp = new Date().toISOString()
  const directories = new Map<string, ICopilotInMemorySessionFsDirectory>([
    ['.', { createdAt: timestamp, updatedAt: timestamp }],
    [
      InMemorySessionFsStatePath,
      { createdAt: timestamp, updatedAt: timestamp },
    ],
  ])

  const normalizePath = (path: string) => {
    const normalized = posix.normalize(path.replace(/\\/g, '/'))
    return normalized === '/' ? normalized : normalized.replace(/\/$/, '')
  }

  const getParentPath = (path: string) => {
    const normalized = normalizePath(path)
    return posix.dirname(normalized)
  }

  const getTimestamp = () => new Date().toISOString()

  const addDirectory = (path: string, recursive = true) => {
    const normalized = normalizePath(path)
    const existing = directories.get(normalized)

    if (existing !== undefined) {
      return
    }

    if (files.has(normalized)) {
      throw createCopilotInMemorySessionFsError(normalized, 'EEXIST')
    }

    if (normalized !== '.' && normalized !== '/') {
      const parentPath = getParentPath(normalized)

      if (recursive) {
        addDirectory(parentPath)
      } else if (!directories.has(parentPath)) {
        throw createCopilotInMemorySessionFsError(parentPath)
      }
    }

    const timestamp = getTimestamp()
    directories.set(normalized, {
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  const addParentDirectory = (path: string) => {
    addDirectory(getParentPath(path))
  }

  const getDirectChildren = (path: string) => {
    const normalized = normalizePath(path)
    const prefix =
      normalized === '.' ? '' : normalized === '/' ? '/' : `${normalized}/`
    const children = new Set<string>()

    for (const entry of [...files.keys(), ...directories.keys()]) {
      if (entry === normalized || !entry.startsWith(prefix)) {
        continue
      }

      const child = entry.slice(prefix.length).split('/')[0]
      if (child.length > 0) {
        children.add(child)
      }
    }

    return [...children]
  }

  const writeFile = (path: string, content: string) => {
    const normalized = normalizePath(path)

    if (directories.has(normalized)) {
      throw createCopilotInMemorySessionFsError(normalized, 'EISDIR')
    }

    addParentDirectory(normalized)

    const existing = files.get(normalized)
    const timestamp = getTimestamp()
    files.set(normalized, {
      content,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    })
  }

  return {
    readFile: async path => {
      const normalized = normalizePath(path)
      const file = files.get(normalized)

      if (file === undefined) {
        throw createCopilotInMemorySessionFsError(path)
      }

      return file.content
    },
    writeFile: async (path, content) => writeFile(path, content),
    appendFile: async (path, content) => {
      const normalized = normalizePath(path)
      const existing = files.get(normalized)
      writeFile(normalized, `${existing?.content ?? ''}${content}`)
    },
    exists: async path => {
      const normalized = normalizePath(path)
      return files.has(normalized) || directories.has(normalized)
    },
    stat: async path => {
      const normalized = normalizePath(path)
      const file = files.get(normalized)

      if (file !== undefined) {
        const fileInfo: SessionFsFileInfo = {
          isFile: true,
          isDirectory: false,
          size: Buffer.byteLength(file.content),
          mtime: file.updatedAt,
          birthtime: file.createdAt,
        }
        return fileInfo
      }

      const directory = directories.get(normalized)

      if (directory !== undefined) {
        const directoryInfo: SessionFsFileInfo = {
          isFile: false,
          isDirectory: true,
          size: 0,
          mtime: directory.updatedAt,
          birthtime: directory.createdAt,
        }
        return directoryInfo
      }

      throw createCopilotInMemorySessionFsError(path)
    },
    mkdir: async (path, recursive) => {
      addDirectory(path, recursive)
    },
    readdir: async path => {
      const normalized = normalizePath(path)
      if (!directories.has(normalized)) {
        throw createCopilotInMemorySessionFsError(path)
      }

      return getDirectChildren(normalized)
    },
    readdirWithTypes: async path => {
      const normalized = normalizePath(path)
      if (!directories.has(normalized)) {
        throw createCopilotInMemorySessionFsError(path)
      }

      return getDirectChildren(normalized).map(name => {
        const childPath = posix.join(normalized, name)
        const entry: CopilotInMemorySessionFsReaddirWithTypesEntry = {
          name,
          type: files.has(childPath) ? 'file' : 'directory',
        }
        return entry
      })
    },
    rm: async (path, recursive, force) => {
      const normalized = normalizePath(path)
      const exists = files.has(normalized) || directories.has(normalized)

      if (!exists) {
        if (force) {
          return
        }

        throw createCopilotInMemorySessionFsError(path)
      }

      if (directories.has(normalized)) {
        const prefix = normalized === '/' ? '/' : `${normalized}/`
        const hasChildren = getDirectChildren(normalized).length > 0

        if (hasChildren && !recursive) {
          throw new Error(`Directory not empty: ${path}`)
        }

        for (const filePath of [...files.keys()]) {
          if (filePath.startsWith(prefix)) {
            files.delete(filePath)
          }
        }

        for (const directoryPath of [...directories.keys()]) {
          if (directoryPath.startsWith(prefix)) {
            directories.delete(directoryPath)
          }
        }
      }

      files.delete(normalized)
      directories.delete(normalized)
    },
    rename: async (src, dest) => {
      const normalizedSrc = normalizePath(src)
      const normalizedDest = normalizePath(dest)
      const file = files.get(normalizedSrc)

      if (file !== undefined) {
        if (normalizedSrc === normalizedDest) {
          return
        }

        if (directories.has(normalizedDest)) {
          throw createCopilotInMemorySessionFsError(normalizedDest, 'EISDIR')
        }

        addParentDirectory(normalizedDest)
        files.set(normalizedDest, file)
        files.delete(normalizedSrc)
        return
      }

      const directory = directories.get(normalizedSrc)

      if (directory === undefined) {
        throw createCopilotInMemorySessionFsError(src)
      }

      if (normalizedSrc === normalizedDest) {
        return
      }

      if (normalizedDest.startsWith(`${normalizedSrc}/`)) {
        throw createCopilotInMemorySessionFsError(normalizedDest, 'EINVAL')
      }

      if (files.has(normalizedDest) || directories.has(normalizedDest)) {
        throw createCopilotInMemorySessionFsError(normalizedDest, 'EEXIST')
      }

      addParentDirectory(normalizedDest)
      directories.set(normalizedDest, directory)

      const srcPrefix = `${normalizedSrc}/`
      const destPrefix = `${normalizedDest}/`
      for (const [filePath, entry] of [...files]) {
        if (filePath.startsWith(srcPrefix)) {
          files.set(`${destPrefix}${filePath.slice(srcPrefix.length)}`, entry)
          files.delete(filePath)
        }
      }

      for (const directoryPath of [...directories.keys()]) {
        if (directoryPath.startsWith(srcPrefix)) {
          const directory = directories.get(directoryPath)
          if (directory !== undefined) {
            directories.set(
              `${destPrefix}${directoryPath.slice(srcPrefix.length)}`,
              directory
            )
          }
          directories.delete(directoryPath)
        }
      }

      directories.delete(normalizedSrc)
    },
  }
}
