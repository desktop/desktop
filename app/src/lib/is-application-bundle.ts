import getFileMetadata from 'file-metadata'

export async function isApplicationBundle(path: string): Promise<boolean> {
  if (!__DARWIN__) {
    return false
  }

  const metadata = await getFileMetadata(path)

  if (metadata['contentType'] === 'com.apple.application-bundle') {
    return true
  }

  const contentTypeTree = metadata['contentTypeTree']

  if (Array.isArray(contentTypeTree)) {
    for (const contentType of contentTypeTree) {
      switch (contentType) {
        case 'com.apple.application-bundle':
        case 'com.apple.application':
        case 'public.executable':
          return true
      }
    }
  }

  return false
}
