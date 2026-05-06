/** A user-defined favourites group displayed as a tab in the sidebar. */
export class FavouriteGroup {
  public constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly sortOrder: number
  ) {}
}
