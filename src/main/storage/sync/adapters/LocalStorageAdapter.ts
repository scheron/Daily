import {isNewerOrEqual} from "@shared/utils/date/validators"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import type {BranchDoc, FileDoc, SettingsDoc, TagDoc, TaskDoc} from "@/types/database"
import type {ILocalStorage, Snapshot, SyncDoc} from "@/types/sync"

export class LocalStorageAdapter implements ILocalStorage {
  constructor(private db: PouchDB.Database) {}

  /**
   * Load all documents for building snapshot.
   * Internal method - returns just docs without meta.
   */
  async loadAllDocs(): Promise<Snapshot["docs"]> {
    const result = await this.db.allDocs({include_docs: true, attachments: true, binary: false})

    const tasks: TaskDoc[] = []
    const tags: TagDoc[] = []
    const branches: BranchDoc[] = []
    const files: FileDoc[] = []
    let settings: SettingsDoc | null = null

    for (const row of result.rows) {
      const doc = row.doc as any
      if (!doc || doc._deleted) continue

      switch (doc.type) {
        case "task":
          tasks.push(this._stripServiceFields(doc) as TaskDoc)
          break
        case "tag":
          tags.push(this._stripServiceFields(doc) as TagDoc)
          break
        case "branch":
          branches.push(this._stripServiceFields(doc) as BranchDoc)
          break
        case "file":
          files.push(this._stripServiceFields(doc) as FileDoc)
          break
        case "settings":
          settings = this._stripServiceFields(doc) as SettingsDoc
          break
      }
    }

    return {tasks, tags, branches, files, settings}
  }

  /**
   * Upsert batch of documents.
   *
   * Logic:
   * 1. allDocs(keys=ids) to get current _rev.
   * 2. bulkDocs(docs with correct _rev).
   * 3. For conflicts (409) — separate retry through withRetryOnConflict:
   *    - read fresh doc
   *    - compare updatedAt
   *      * if incoming.updatedAt > existing.updatedAt → overwrite
   *      * otherwise — consider local version newer and don't touch.
   */
  async upsertDocs(docs: SyncDoc[]): Promise<void> {
    if (!docs.length) return

    const ids = docs.map((d) => d._id)
    const docsById = new Map<string, SyncDoc>()
    for (const d of docs) docsById.set(d._id, d)

    // 1) get current revisions
    const existing = await this.db.allDocs<{_id: string; _rev: string}>({
      keys: ids,
      include_docs: true,
    })

    const existingById = new Map<string, {_id: string; _rev: string}>()
    for (const row of existing.rows) {
      if ("error" in row) continue

      const doc = row.doc

      if (doc && doc._id && doc._rev) {
        existingById.set(doc._id, {_id: doc._id, _rev: doc._rev})
      }
    }

    // 2) build payload for bulkDocs
    const bulkPayload = docs.map((incoming) => {
      const base = existingById.get(incoming._id)

      if (base) {
        // Document already exists locally — substitute actual _rev,
        // but take other fields from incoming (remote / merged state).
        return {
          ...incoming,
          _id: base._id,
          _rev: base._rev,
        }
      }

      // New document — remove _rev if it came from snapshot
      const copy: any = {...incoming}
      delete copy._rev
      return copy
    })

    const result = await this.db.bulkDocs(bulkPayload as any)

    // 3) Handle conflicts
    const conflicts = result.filter((r: any) => r && r.error && (r.status === 409 || r.name === "conflict")) as {id: string}[]

    if (!conflicts.length) return

    // For each conflicting document, do a point-wise LWW through withRetryOnConflict
    for (const {id} of conflicts) {
      const incoming = docsById.get(id)
      if (!incoming) continue

      await withRetryOnConflict("[SYNC-UPSERT]", async () => {
        let existingDoc: SyncDoc
        try {
          existingDoc = (await this.db.get(id)) as SyncDoc
        } catch (err: any) {
          if (err?.status === 404) {
            // It was already deleted locally → simply create as new
            const fresh: any = {...incoming}
            delete fresh._rev
            await this.db.put(fresh)
            return
          }
          throw err
        }

        // If local updatedAt is newer or equal — keep local
        if (isNewerOrEqual(existingDoc.updatedAt, incoming.updatedAt)) {
          // Local version won (or is equal) — keep local
          return
        }

        // Otherwise incoming is newer — overwrite local
        const next: SyncDoc = {
          ...incoming,
          _id: existingDoc._id,
          _rev: existingDoc._rev,
        }

        await this.db.put(next as any)
      })
    }
  }

  /**
   * Hard delete batch of documents (for garbage collection).
   *
   * Logic:
   * 1. allDocs(keys=ids) → get current _rev
   * 2. bulkDocs([...{_deleted: true}])
   * 3. For conflicts — point-wise retry with withRetryOnConflict
   */
  async deleteDocs(ids: string[]): Promise<void> {
    if (!ids.length) return

    // 1) get current revisions
    const existing = await this.db.allDocs<SyncDoc>({
      keys: ids,
      include_docs: true,
    })

    const toDelete: any[] = []

    for (const row of existing.rows) {
      if ("error" in row) continue

      const doc = row.doc as any
      if (!doc || !doc._id || !doc._rev) continue

      toDelete.push({
        _id: doc._id,
        _rev: doc._rev,
        _deleted: true,
      })
    }

    if (!toDelete.length) return

    const result = await this.db.bulkDocs(toDelete)

    const conflicts = result.filter((r: any) => r && r.error && (r.status === 409 || r.name === "conflict")) as {id: string}[]

    if (!conflicts.length) return

    // 3) For conflicts — separate retry
    for (const {id} of conflicts) {
      await withRetryOnConflict("[SYNC-DELETE]", async () => {
        let existingDoc: SyncDoc
        try {
          existingDoc = (await this.db.get(id)) as SyncDoc
        } catch (err: any) {
          if (err?.status === 404) {
            // Already deleted locally — ok
            return
          }
          throw err
        }

        await this.db.remove(existingDoc as any)
      })
    }
  }

  private _stripServiceFields(doc: SyncDoc): SyncDoc {
    const {_rev, ...data} = doc
    return data
  }
}
