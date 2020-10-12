import Dexie from 'dexie'

export abstract class BaseDatabase extends Dexie {
  private schemaVersion: number | undefined

  public constructor(name: string, schemaVersion: number | undefined) {
    super(name)

    this.schemaVersion = schemaVersion
  }

  /**
   * Register the version of the schema only if `targetVersion` is less than
   * `version` or is `undefined`.
   *
   * targetVersion - The version of the schema that is being targeted. If not
   *                 provided, the given version will be registered.
   * version       - The version being registered.
   * schema        - The schema to register.
   * upgrade       - An upgrade function to call after upgrading to the given
   *                 version.
   */
  protected async conditionalVersion(
    version: number,
    schema: { [key: string]: string | null },
    upgrade?: (t: Dexie.Transaction) => Promise<void>
  ) {
    if (this.schemaVersion != null && this.schemaVersion < version) {
      return
    }

    const dexieVersion = this.version(version).stores(schema)

    if (upgrade != null) {
      await dexieVersion.upgrade(upgrade)
    }
  }
}
