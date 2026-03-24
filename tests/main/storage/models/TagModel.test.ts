import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {TagModel} from "@main/storage/models/TagModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {TAGS: "TAGS"}},
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

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
    const tag = tagModel.createTag({name: "Work", color: "#0000ff"})
    expect(tag.name).toBe("Work")
    expect(tag.color).toBe("#0000ff")

    tagModel.updateTag(tag.id, {name: "Personal"})
    const updated = tagModel.getTag(tag.id)
    expect(updated.name).toBe("Personal")

    tagModel.deleteTag(tag.id)
    expect(tagModel.getTagList()).toHaveLength(0)
    expect(tagModel.getTagList({includeDeleted: true})).toHaveLength(1)
  })
})
