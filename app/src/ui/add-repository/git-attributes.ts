import * as FSE from 'fs-extra'
import * as Path from 'path'

/**
 * Write the .gitAttributes file to the given repository
 */
export async function writeGitAttributes(path: string): Promise<void> {
  const fullPath = Path.join(path, '.gitattributes')
  const contents =
    '# Auto detect text files and perform LF normalization\n* text=auto\n'
  await FSE.writeFile(fullPath, contents)
}
