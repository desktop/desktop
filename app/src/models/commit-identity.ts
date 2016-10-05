/**
 * A tuple of name and email for the author or commit
 * info in a commit.
 */
export class CommitIdentity {
  public readonly name: string
  public readonly email: string

  /**
   * Parses a Git ident string (GIT_AUTHOR_IDENT or GIT_COMMITTER_IDENT)
   * into a commit identity. Returns null if string could not be parsed.
   */
  public static parseIdent(ident: string): CommitIdentity | null {
    // See fmt_ident in ident.c:
    //  https://github.com/git/git/blob/3ef7618e616e023cf04180e30d77c9fa5310f964/ident.c#L346
    //
    // Format is "NAME <EMAIL> DATE"
    //  Markus Olsson <j.markus.olsson@gmail.com> 1475670580 +0200
    //
    // Note that `git var` will strip any < and > from the name and email, see:
    //  https://github.com/git/git/blob/3ef7618e616e023cf04180e30d77c9fa5310f964/ident.c#L396
    const m = ident.match(/^(.*?) <(.*?)>/)
    if (!m) { return null }

    const name = m[1]
    const email = m[2]

    return new CommitIdentity(name, email)
  }

  public constructor(name: string, email: string) {
    this.name = name
    this.email = email
  }
}
