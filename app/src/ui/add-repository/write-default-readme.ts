import { writeFile } from 'fs-extra'
import * as Path from 'path'

const DefaultReadmeName = 'README.md'

function defaultReadmeContents(name: string): string {
  return `# ${name}\n`
}

/**
 * Write the default README to the repository with the given name at the path.
 */
export async function writeDefaultReadme(
  path: string,
  name: string
): Promise<void> {
  const fullPath = Path.join(path, DefaultReadmeName)
  const contents = defaultReadmeContents(name)
  await writeFile(fullPath, contents)
}
