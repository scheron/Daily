import {deleteDB, openDB} from "idb"

import type {IDBPDatabase, IDBPObjectStore} from "idb"

type Index = {name: string; keyPath: string | string[]; options?: IDBIndexParameters}
export type Store = {name: string; keyPath: string | string[]; indexes?: Index[]}

export class LocalDB {
  private dbPromise: Promise<IDBPDatabase> | null = null
  static DEFAULT_VERSION = 1
  static VERSION_KEY = "db_version"

  constructor(
    private dbName = "",
    private stores: Store[] = [],
    private version = LocalDB.DEFAULT_VERSION,
  ) {
    this.init()
  }

  private handleUpgrade(db: IDBPDatabase) {
    this.stores.forEach(({name, keyPath, indexes = []}) => {
      if (!db.objectStoreNames.contains(name)) {
        const store = db.createObjectStore(name, {keyPath})

        indexes?.forEach(({name, keyPath, options}) => {
          if (!store.indexNames.contains(name)) {
            store.createIndex(name, keyPath, options)
          }
        })
      }
    })
  }

  init() {
    this.dbPromise = openDB(this.dbName, this.version, {
      upgrade: this.handleUpgrade.bind(this),
    })
  }

  async destroy() {
    const db = await this.dbPromise
    db?.close()
    await deleteDB(this.dbName)
    this.dbPromise = null
  }

  async transaction<T, M extends "readonly" | "readwrite">(
    mode: M,
    storeNames: string | string[],
    callback: (stores: IDBPObjectStore<unknown, ArrayLike<string>, string, M>[], finish: (success?: boolean) => void) => Promise<T>,
  ): Promise<T> {
    const db = await this.dbPromise
    if (!db) throw new Error("Database not initialized")

    const stores = Array.isArray(storeNames) ? storeNames : [storeNames]

    stores.forEach((storeName) => {
      if (!db.objectStoreNames.contains(storeName)) {
        throw new Error(`Object store ${storeName} does not exist`)
      }
    })

    const tx = db.transaction(stores, mode)
    const objectStores = stores.map((storeName) => tx.objectStore(storeName))

    try {
      let done = false

      const result = await callback(objectStores, (success = true) => {
        done = success
      })

      if (done) await tx.done
      else throw new Error("Transaction aborted")

      return result
    } catch (error) {
      tx.abort()
      throw error
    }
  }
}
