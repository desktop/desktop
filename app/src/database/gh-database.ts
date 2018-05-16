import * as Loki from 'lokijs'
import { Collections, IRepository } from '.'
import { assertNever } from '../lib/fatal-error'

const DbPath = '/Users/williamshepherd/Desktop/gh.db'

export function getGHDatabase() {
  let ghDb: GHDatabase | null = null

  return function() {
    if (ghDb === null) {
      ghDb = new GHDatabase(DbPath)
    }

    return ghDb
  }
}

export class GHDatabase {
  private readonly db: Loki

  public constructor(path: string) {
    this.db = new Loki(path)
    this.initCollections()
  }

  public getCollection(collection: Collections) {
    switch (collection) {
      case Collections.Repository:
        return this.db.getCollection<IRepository>(Collections.Repository)
      default:
        return assertNever(collection, `unknown collection ${collection}`)
    }
  }

  public async save() {
    await this.db.save(this.onSaveError)
  }

  private initCollections() {
    if (this.db.getCollection(Collections.Repository) == null) {
      this.db.addCollection<IRepository>(Collections.Repository)
    }
  }

  private onSaveError = (error?: any) => {
    if (error != null) {
      log.error(error)
    }
  }
}
