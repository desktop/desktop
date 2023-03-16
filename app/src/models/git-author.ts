export class GitAuthor {
  public static parse(nameAddr: string): GitAuthor | null {
    const m = nameAddr.match(/^(.*?)\s+<(.*?)>/)
    return m === null ? null : new GitAuthor(m[1], m[2])
  }

  public constructor(
    public readonly name: string,
    public readonly email: string
  ) {}

  public toString() {
    return `${this.name} <${this.email}>`
  }
}
