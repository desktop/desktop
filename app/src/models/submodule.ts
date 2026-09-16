export class SubmoduleEntry {
  public constructor(
    public readonly sha: string,
    public readonly path: string,
    /** The git describe output, or null when Git omits it. */
    public readonly describe: string | null
  ) {}
}
