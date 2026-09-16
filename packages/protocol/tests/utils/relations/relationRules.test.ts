// @ts-nocheck
import {describe, expect, it} from "vitest"

import {canLinkTasks, planTaskRelations, toTaskRelationId} from "../../../src/utils/relations/relationRules"

import type {RelationContext} from "../../../src/utils/relations/relationRules"

function makeTask(id, branchId, overrides = {}) {
  return {id, branchId, deletedAt: null, ...overrides}
}

function makeRelation(blockerId, blockedId, overrides = {}) {
  return {id: toTaskRelationId(blockerId, blockedId), blockerId, blockedId, deletedAt: null, ...overrides}
}

describe("relationRules", () => {
  it("plans_TC-1_only_the_one_linkable_id_from_a_mixed_bag_and_leaves_the_already-linked_pair_alone", () => {
    const ctx: RelationContext = {
      tasks: [
        makeTask("A", "P"),
        makeTask("B", "P"),
        makeTask("C", "P"),
        makeTask("D", "Q"),
        makeTask("E", "P", {deletedAt: "2026-09-01T00:00:00.000Z"}),
      ],
      relations: [makeRelation("A", "B")],
    }

    const plan = planTaskRelations(ctx, "B", {blockedBy: ["A", "C", "D", "E", "B", "C"], blocks: []})

    expect(plan.linked).toEqual([{id: toTaskRelationId("C", "B"), blockerId: "C", blockedId: "B"}])
    expect(plan.unlinked).toEqual([])
  })

  it("rejects_TC-2_a_link_that_would_close_a_cycle_or_repeat_a_pair_and_plans_nothing_for_an_already-agreeing_set", () => {
    const ctx: RelationContext = {
      tasks: [makeTask("A", "P"), makeTask("B", "P"), makeTask("C", "P"), makeTask("D", "P")],
      relations: [makeRelation("A", "B"), makeRelation("B", "C")],
    }

    expect(canLinkTasks(ctx, "C", "A")).toBe(false)
    expect(canLinkTasks(ctx, "A", "C")).toBe(true)
    expect(canLinkTasks(ctx, "D", "D")).toBe(false)
    expect(canLinkTasks(ctx, "A", "B")).toBe(false)

    const plan = planTaskRelations(ctx, "A", {blockedBy: ["C"], blocks: ["B"]})
    expect(plan.linked).toEqual([])
    expect(plan.unlinked).toEqual([])
  })

  it("treats_TC-3_a_flip_and_a_full_unlink_of_the_same_pair-locked_id_correctly", () => {
    const ctx: RelationContext = {
      tasks: [makeTask("A", "P"), makeTask("B", "P")],
      relations: [makeRelation("A", "B")],
    }

    expect(toTaskRelationId("A", "B")).toBe(toTaskRelationId("B", "A"))

    const flipped = planTaskRelations(ctx, "B", {blockedBy: [], blocks: ["A"]})
    expect(flipped.linked).toEqual([{id: toTaskRelationId("A", "B"), blockerId: "B", blockedId: "A"}])
    expect(flipped.unlinked).toEqual([])

    const cleared = planTaskRelations(ctx, "B", {blockedBy: [], blocks: []})
    expect(cleared.linked).toEqual([])
    expect(cleared.unlinked).toEqual([toTaskRelationId("A", "B")])
  })
})
