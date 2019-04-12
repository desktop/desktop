export class NullDelimiterParser<T extends { [name: string]: string }> {
  private readonly keys = new Array<string>()
  public readonly format: string = ''

  public constructor(fields: T) {
    for (const [key, value] of Object.entries(fields)) {
      this.keys.push(key)
      this.format = this.format ? `${this.format}%x00${value}` : value
    }
  }

  public *parse(output: string): Iterable<T> {
    const fields = output.split('\0')
    const { keys } = this

    for (let i = 0; i < fields.length - keys.length; i += keys.length) {
      const entry = {} as T
      for (let j = 0; j < keys.length; j++) {
        entry[keys[j]] = fields[i + j]
      }
      yield entry
    }
  }
}
