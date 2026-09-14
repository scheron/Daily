// @ts-nocheck
import {describe, expect, it} from "vitest"

import {isMilestoneClosed, isMilestoneOverdue, milestoneCompletion} from "../../../src/utils/milestones/milestoneState"

function progress(total: number, resolved: number) {
  return {total, resolved}
}

describe("isMilestoneClosed / milestoneCompletion", () => {
  it("reads_TC-13_the_progress_of_a_milestone_with_a_mix_of_task_statuses_as_half_resolved_and_open", () => {
    // one done, one discarded, one active, one backlog — total 4, resolved (done+discarded) 2
    const p = progress(4, 2)

    expect(p.total).toBe(4)
    expect(p.resolved).toBe(2)
    expect(milestoneCompletion(p)).toBe(0.5)
    expect(isMilestoneClosed(p)).toBe(false)
  })

  it("closes_TC-14_a_milestone_whose_every_task_is_done_or_discarded", () => {
    expect(isMilestoneClosed(progress(3, 3))).toBe(true)
  })

  it("agrees_TC-32_closed_and_a_completion_of_exactly_one_are_the_same_fact_in_either_direction", () => {
    const cases = [progress(0, 0), progress(4, 2), progress(5, 5), progress(1, 1), progress(3, 1)]

    for (const p of cases) {
      expect(isMilestoneClosed(p)).toBe(milestoneCompletion(p) === 1)
    }
  })

  it("keeps_TC-15_an_empty_milestone_open_at_zero_percent", () => {
    const p = progress(0, 0)

    expect(isMilestoneClosed(p)).toBe(false)
    expect(milestoneCompletion(p)).toBe(0)
  })
})

describe("isMilestoneOverdue", () => {
  const TODAY = "2026-06-15"

  it("reports_TC-16_a_milestone_at_ninety-nine_percent_with_a_past_date_as_overdue_without_touching_its_completion", () => {
    const p = progress(100, 99)

    expect(isMilestoneOverdue({targetDate: "2026-06-14"}, p, TODAY)).toBe(true)
    expect(milestoneCompletion(p)).toBe(0.99)
  })

  it("never_TC-17_calls_a_closed_or_dateless_milestone_overdue", () => {
    const closedButPastDate = progress(5, 5)
    expect(isMilestoneOverdue({targetDate: "2026-01-01"}, closedButPastDate, TODAY)).toBe(false)

    const openWithNoDate = progress(3, 1)
    expect(isMilestoneOverdue({targetDate: null}, openWithNoDate, TODAY)).toBe(false)
  })
})
