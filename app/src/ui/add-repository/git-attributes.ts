import { writeFile } from 'fs-extra'
import { join } from 'path'

/**
 * Write the .gitAttributes file to the given repository
 */
export async function writeGitAttributes(path: string): Promise<void> {
  const fullPath = join(path, '.gitattributes')
  const contents =
    '# Auto detect text files and perform LF normalization\n* text=auto\n'
  await writeFile(fullPath, contents)
}
