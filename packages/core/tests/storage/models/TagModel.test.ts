import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {TagModel} from "@core/storage/models/TagModel"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {TAGS: "TAGS"}},
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

describe("TagModel", () => {
  let db
  let tagModel

  beforeEach(() => {
    db = createTestDatabase()
    tagModel = new TagModel(db)
  })

  afterEach(() => {
    db.close()
  })

  it("creates, reads, updates, and soft-deletes a tag", () => {
    const tag = tagModel.createTag({name: "Work", color: "#0000ff", branchId: "main"})
    expect(tag.name).toBe("Work")
    expect(tag.color).toBe("#0000ff")

    tagModel.updateTag(tag.id, {name: "Personal"})
    const updated = tagModel.getTag(tag.id)
    expect(updated.name).toBe("Personal")

    tagModel.deleteTag(tag.id)
    expect(tagModel.getTagList()).toHaveLength(0)
    expect(tagModel.getTagList({includeDeleted: true})).toHaveLength(1)
  })

  it("scopes_TC-10_a_tag_to_the_project_it_was_created_in_letting_the_same_name_repeat_elsewhere", () => {
    const branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    const other = branchModel.createBranch({name: "Other project"})

    const mainTag = tagModel.createTag({name: "bug", color: "#ff0000", branchId: "main"})
    const otherTag = tagModel.createTag({name: "bug", color: "#00ff00", branchId: other.id})

    expect(mainTag.name).toBe("bug")
    expect(otherTag.name).toBe("bug")

    const mainList = tagModel.getTagList({branchId: "main"}).map((t) => t.id)
    expect(mainList).toContain(mainTag.id)
    expect(mainList).not.toContain(otherTag.id)

    const otherList = tagModel.getTagList({branchId: other.id}).map((t) => t.id)
    expect(otherList).toContain(otherTag.id)
    expect(otherList).not.toContain(mainTag.id)
  })
})
