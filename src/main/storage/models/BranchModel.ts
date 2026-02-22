import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID, MAIN_BRANCH_NAME} from "@shared/constants/storage"
import {createCacheLoader} from "@/utils/createCacheLoader"
import {logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {branchToDoc, docIdMap, docToBranch} from "./_mappers"

import type {BranchDoc} from "@/types/database"
import type {Branch} from "@shared/types/storage"

export class BranchModel {
  private CACHE_TTL = 5 * 60_000
  private branchListLoader: ReturnType<typeof createCacheLoader<Branch[]>>

  constructor(private db: PouchDB.Database) {
    this.branchListLoader = createCacheLoader(() => this.loadBranchListFromDB(), this.CACHE_TTL)
  }

  invalidateCache() {
    this.branchListLoader.clear()
  }

  async getBranchList({includeDeleted = false}: {includeDeleted?: boolean} = {}): Promise<Branch[]> {
    await this.ensureMainBranchDoc()
    const branches = await this.branchListLoader.get()
    return branches.filter((branch) => includeDeleted || !branch.deletedAt)
  }

  async getBranch(id: Branch["id"], {includeDeleted = false}: {includeDeleted?: boolean} = {}): Promise<Branch | null> {
    await this.ensureMainBranchDoc()

    try {
      const doc = await this.db.get<BranchDoc>(docIdMap.branch.toDoc(id))
      const branch = docToBranch(doc)

      if (!includeDeleted && branch.deletedAt) return null
      return branch
    } catch (error: any) {
      if (error?.status === 404) {
        logger.warn(logger.CONTEXT.BRANCHES, `Branch not found: ${id}`)
        return null
      }
      logger.error(logger.CONTEXT.BRANCHES, `Failed to get branch ${id}`, error)
      throw error
    }
  }

  async createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null> {
    await this.ensureMainBranchDoc()

    const id = nanoid()
    const now = new Date().toISOString()

    try {
      const doc = branchToDoc({
        id,
        name: branch.name,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })

      const res = await this.db.put(doc)

      if (!res.ok) {
        throw new Error(`Failed to create branch ${id}`)
      }

      logger.storage("Created", "BRANCHES", id)
      logger.debug(logger.CONTEXT.BRANCHES, `Branch rev: ${res.rev}`)

      this.branchListLoader.clear()

      return docToBranch(doc)
    } catch (error: any) {
      logger.error(logger.CONTEXT.BRANCHES, `Failed to create branch ${id}`, error)
      return null
    }
  }

  async updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null> {
    await this.ensureMainBranchDoc()

    if (id === MAIN_BRANCH_ID) {
      logger.warn(logger.CONTEXT.BRANCHES, "Main branch cannot be renamed")
      return null
    }

    return await withRetryOnConflict("[BRANCH]", async (attempt) => {
      const existing = await this.db.get<BranchDoc>(docIdMap.branch.toDoc(id))
      const patched = this.applyDiffToDoc(existing, updates)

      const now = new Date().toISOString()

      const updatedDoc: BranchDoc = {
        ...existing,
        ...patched,
        createdAt: existing?.createdAt ?? patched?.createdAt ?? now,
        updatedAt: now,
        _id: existing._id,
        _rev: existing._rev,
      }

      const res = await this.db.put(updatedDoc)

      if (!res.ok) {
        throw new Error(`Failed to update branch ${id}`)
      }

      logger.storage("Updated", "BRANCHES", id)
      logger.debug(logger.CONTEXT.BRANCHES, `Branch rev: ${res.rev}, attempt: ${attempt + 1}`)

      this.branchListLoader.clear()

      return docToBranch(updatedDoc)
    })
  }

  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    await this.ensureMainBranchDoc()

    if (id === MAIN_BRANCH_ID) {
      logger.warn(logger.CONTEXT.BRANCHES, "Main branch cannot be deleted")
      return false
    }

    const isDeleted = await withRetryOnConflict("[BRANCH]", async (attempt) => {
      try {
        const doc = await this.db.get<BranchDoc>(docIdMap.branch.toDoc(id))

        const now = new Date().toISOString()
        const deletedDoc: BranchDoc = {
          ...doc,
          deletedAt: now,
          updatedAt: now,
        }

        const res = await this.db.put(deletedDoc)

        if (!res.ok) {
          throw new Error(`Failed to soft-delete branch ${id}`)
        }

        logger.storage("Deleted", "BRANCHES", id)
        logger.debug(logger.CONTEXT.BRANCHES, `Branch rev: ${res.rev}, attempt: ${attempt + 1}`)
        this.branchListLoader.clear()

        return true
      } catch (error: any) {
        if (error?.status === 404) {
          logger.warn(logger.CONTEXT.BRANCHES, `Branch not found for deletion: ${id}`)
          return false
        }

        logger.error(logger.CONTEXT.BRANCHES, `Failed to delete branch ${id}`, error)
        throw error
      }
    })

    return Boolean(isDeleted)
  }

  private async loadBranchListFromDB(): Promise<Branch[]> {
    try {
      const result = (await this.db.find({selector: {type: "branch"}})) as PouchDB.Find.FindResponse<BranchDoc>
      const branches = result.docs.map(docToBranch)

      logger.info(logger.CONTEXT.BRANCHES, `Loaded ${branches.length} branches from database`)
      return branches
    } catch (error) {
      logger.error(logger.CONTEXT.BRANCHES, "Failed to load branches from database", error)
      throw error
    }
  }

  private applyDiffToDoc(doc: BranchDoc, updates: Pick<Branch, "name">): BranchDoc {
    const nextDoc = {...doc}

    if (updates.name !== undefined) {
      nextDoc.name = updates.name
    }

    return nextDoc
  }

  private async ensureMainBranchDoc(): Promise<void> {
    const id = MAIN_BRANCH_ID

    try {
      const existing = await this.db.get<BranchDoc>(docIdMap.branch.toDoc(id))

      if (!existing.deletedAt) return

      const now = new Date().toISOString()
      const restoredDoc: BranchDoc = {
        ...existing,
        name: existing.name || MAIN_BRANCH_NAME,
        deletedAt: null,
        updatedAt: now,
      }

      await this.db.put(restoredDoc)
      this.branchListLoader.clear()
      return
    } catch (error: any) {
      if (error?.status !== 404) throw error
    }

    const now = new Date().toISOString()
    const doc = branchToDoc({
      id,
      name: MAIN_BRANCH_NAME,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    await this.db.put(doc)
    this.branchListLoader.clear()
  }
}
