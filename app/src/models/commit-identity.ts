/**
 * A tuple of name and email for the author or commit
 * info in a commit.
 */
export class CommitIdentity {
  public readonly name: string
  public readonly email: string

  public constructor(name: string, email: string) {
    this.name = name
    this.email = email

    console.log(this.name, this.email)
  }
}
