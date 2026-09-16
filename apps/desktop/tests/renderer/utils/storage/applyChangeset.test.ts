// @ts-nocheck
import {ref, toRaw} from "vue"
import {describe, expect, it} from "vitest"

import {applyChangeset} from "../../../../src/renderer/src/utils/storage/applyChangeset"

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "active",
    content: "Test",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-09-14", time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeTag(overrides = {}) {
  return {
    id: "tag-1",
    branchId: "main",
    name: "Tag",
    color: "#000000",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeRelation(overrides = {}) {
  return {
    id: "r1",
    blockerId: "a",
    blockedId: "b",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeBranch(overrides = {}) {
  return {
    id: "main",
    name: "Main",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("applyChangeset", () => {
  it("upserts one row and removes another while leaving the rest untouched", () => {
    const untouched = makeTask({id: "keep", content: "Keep me"})
    const toUpdate = makeTask({id: "upd", content: "Old"})
    const toRemove = makeTask({id: "rm", content: "Going away"})
    const tasks = ref([untouched, toUpdate, toRemove])
    const untouchedRef = tasks.value.find((t) => t.id === "keep")

    applyChangeset({tasks}, {tasks: {upserted: [{...toUpdate, content: "New"}], removed: ["rm"]}})

    expect(tasks.value.find((t) => t.id === "upd")?.content).toBe("New")
    expect(tasks.value.find((t) => t.id === "rm")).toBeUndefined()
    expect(tasks.value.find((t) => t.id === "keep")).toBe(untouchedRef)
  })

  it("leaves every row as the same object when the same changeset is applied twice", () => {
    const bystander = makeTask({id: "bystander", content: "Unrelated"})
    const task = makeTask({id: "t1", content: "Before"})
    const tasks = ref([bystander, task])

    const changeset = {tasks: {upserted: [{...task, content: "After"}]}}
    applyChangeset({tasks}, changeset)
    const bystanderAfterFirst = tasks.value.find((t) => t.id === "bystander")
    const editedAfterFirst = tasks.value.find((t) => t.id === "t1")

    applyChangeset({tasks}, structuredClone(changeset))

    expect(tasks.value.find((t) => t.id === "bystander")).toBe(bystanderAfterFirst)
    expect(tasks.value.find((t) => t.id === "t1")).toBe(editedAfterFirst)
  })

  it("drops a task a sync pull upserts as soft-deleted, since the collection holds live tasks only", () => {
    const tasks = ref([makeTask({id: "gone"}), makeTask({id: "kept"})])

    applyChangeset({tasks}, {tasks: {upserted: [makeTask({id: "gone", deletedAt: "2026-09-14T10:00:00.000Z"})]}})

    expect(tasks.value.map((t) => t.id)).toEqual(["kept"])
  })

  it("clears the milestone on every task that held a removed milestone and leaves the other tasks as they were", () => {
    const tasks = ref([makeTask({id: "held", milestoneId: "m1"}), makeTask({id: "elsewhere", milestoneId: "m2"})])
    const elsewhere = tasks.value.find((t) => t.id === "elsewhere")

    applyChangeset({tasks}, {milestones: {removed: ["m1"]}})

    expect(tasks.value.find((t) => t.id === "held")?.milestoneId).toBeNull()
    expect(tasks.value.find((t) => t.id === "elsewhere")).toBe(elsewhere)
  })

  it("takes a removed tag off every task carrying it and leaves the other tasks as they were", () => {
    const removedTag = makeTag({id: "tag-a", name: "A"})
    const keptTag = makeTag({id: "tag-b", name: "B"})
    const tasks = ref([makeTask({id: "tagged", tags: [removedTag, keptTag]}), makeTask({id: "untagged", tags: [keptTag]})])
    const untagged = tasks.value.find((t) => t.id === "untagged")

    applyChangeset({tasks}, {tags: {removed: ["tag-a"]}})

    expect(tasks.value.find((t) => t.id === "tagged")?.tags.map((tag) => tag.id)).toEqual(["tag-b"])
    expect(tasks.value.find((t) => t.id === "untagged")).toBe(untagged)
  })

  it("removes a project with its milestones and tags, and moves its tasks the changeset did not remove to main", () => {
    const sideTag = makeTag({id: "side-tag", branchId: "side"})
    const mainTag = makeTag({id: "main-tag", branchId: "main"})
    const mainTask = makeTask({id: "main-task", branchId: "main", milestoneId: "main-m", tags: [mainTag]})
    const tasks = ref([
      makeTask({id: "side-deleted", branchId: "side"}),
      makeTask({id: "side-left", branchId: "side", milestoneId: "side-m", tags: [sideTag]}),
      mainTask,
    ])
    const milestones = ref([makeMilestone({id: "side-m", branchId: "side"}), makeMilestone({id: "main-m", branchId: "main"})])
    const tags = ref([sideTag, mainTag])
    const branches = ref([makeBranch({id: "main"}), makeBranch({id: "side", name: "Side"})])

    applyChangeset({tasks, milestones, tags, branches}, {branches: {removed: ["side"]}, tasks: {removed: ["side-deleted"]}})

    expect(tasks.value.map((t) => t.id)).toEqual(["side-left", "main-task"])
    expect(tasks.value[0]).toMatchObject({branchId: "main", milestoneId: null, tags: []})
    expect(toRaw(tasks.value[1])).toBe(mainTask)
    expect(milestones.value.map((m) => m.id)).toEqual(["main-m"])
    expect(tags.value.map((t) => t.id)).toEqual(["main-tag"])
    expect(branches.value.map((b) => b.id)).toEqual(["main"])
  })

  it("keeps_TC-12_only_the_still-live_relation_after_an_upsert_and_a_removal_and_reuses_the_same_row_object_on_a_repeat", () => {
    const r1 = makeRelation({id: "r1"})
    const r2 = makeRelation({id: "r2"})
    const relations = ref([r1, r2])

    const changeset = {
      relations: {
        upserted: [makeRelation({id: "r3"}), {...r1, deletedAt: "2026-09-14T10:00:00.000Z"}],
        removed: ["r2"],
      },
    }

    applyChangeset({relations}, changeset)
    const survivorAfterFirst = relations.value.find((r) => r.id === "r3")
    expect(relations.value.map((r) => r.id)).toEqual(["r3"])

    applyChangeset({relations}, structuredClone(changeset))
    expect(relations.value.map((r) => r.id)).toEqual(["r3"])
    expect(relations.value.find((r) => r.id === "r3")).toBe(survivorAfterFirst)
  })
})
