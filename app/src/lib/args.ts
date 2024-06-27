export type ArgItem =
  | string
  | false
  | undefined
  | { [key: string]: string | boolean | undefined }

export type ArgTemplate = ArgItem | ReadonlyArray<ArgItem>

export const args = (...templates: ArgTemplate[]) => {
  const arr = new Array<string>()

  for (const template of templates) {
    if (typeof template === 'string') {
      arr.push(template)
    } else if (template === false || template === undefined) {
      continue
    } else if (Array.isArray(template)) {
      template.map(i => args(i)).forEach(i => arr.push(...i))
    } else {
      Object.entries(template).forEach(([key, value]) => {
        if (value) {
          arr.push(key)
          // { '--progress': 'yes' } => ['--progress', 'yes']
          // { '--progress': true } => ['--progress']
          if (value !== true) {
            arr.push(value)
          }
        }
      })
    }
  }

  return arr
}
