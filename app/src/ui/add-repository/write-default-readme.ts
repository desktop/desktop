import { writeFile } from 'fs-extra'
import * as Path from 'path'

const DefaultReadmeName = 'README.md'

function defaultReadmeContents(name: string, description?: string): string {
  return description !== undefined
    ? `# ${name}\n ${description}\n`
    : `# ${name}\n`
}

/**
 * Write the default README to the repository with the given name at the path.
 */
export async function writeDefaultReadme(
  path: string,
  name: string,
  description?: string
): Promise<void> {
  const fullPath = Path.join(path, DefaultReadmeName)
  const contents = defaultReadmeContents(name, description)
  await writeFile(fullPath, contents)
}
