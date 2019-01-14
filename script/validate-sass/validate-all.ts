import * as path from 'path'
import * as glob from 'glob'
import { listUnencodedSassVariables, SassVariable } from './validate-file'

export async function verifyInjectedSassVariables(
  outRoot: string
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    return Promise.resolve()
  }

  console.log(`Checking all SASS variables have been encoded correctly…`)

  const root = path.dirname(outRoot)

  const allStyleSheets = path.join(outRoot, '*.css')
  const stylesheets = glob.sync(allStyleSheets)

  const unencodedVariables = new Array<SassVariable>()

  for (const stylesheet of stylesheets) {
    const relativePath = path.relative(root, stylesheet)
    console.log(`  Checking stylesheet: ${relativePath}…`)
    const result = await listUnencodedSassVariables(stylesheet)
    unencodedVariables.push(...result)
  }

  if (unencodedVariables.length > 0) {
    console.log(
      `Found some SASS variables in the generated stylesheets. This means some styles will not render as expected.`
    )

    for (const stylesheet of stylesheets) {
      const matches = unencodedVariables.filter(v => v.fileName === stylesheet)

      if (matches.length > 0) {
        console.log(`In file: ${stylesheet}`)

        matches.forEach(v =>
          console.log(` - Line ${v.lineNumber}: '${v.text}'`)
        )
      }
    }

    console.log(
      `Look for these variables under app/styles/ and ensure they are wrapped in a '#{}', otherwise the colors will not be rendered correctly in the app at runtime.`
    )

    throw new Error()
  }
}
