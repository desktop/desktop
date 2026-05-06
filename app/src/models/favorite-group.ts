/** A user-defined favorites group displayed as a tab in the sidebar. */
export class FavoriteGroup {
  public constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly sortOrder: number
  ) {}
}
