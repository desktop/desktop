export class GitAuthor {
  public readonly name: string
  public readonly email: string

  public static parse(nameAddr: string): GitAuthor | null {
    const m = nameAddr.match(/^(.*?)\s+<(.*?)>/)
    return m === null ? null : new GitAuthor(m[1], m[2])
  }

  public constructor(name: string, email: string) {
    this.name = name
    this.email = email
  }

  public toString() {
    return `${this.name} <${this.email}>`
  }
}
