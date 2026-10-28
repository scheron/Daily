import {expect, it} from "vitest"

import {makeRealWorkspace} from "../../../../../../packages/tools/tests/helpers/realWorkspace"
import {exerciseStatusContract} from "../../../../../../packages/tools/tests/helpers/statusContract"
import {SHARED_TOOLS} from "../../../../src/main/ai/tools/registry/categories/shared"

import type {StorageController} from "@daily/core"

it("the Assistant wrapper preserves six exact statuses and authorship in Normal mode", async () => {
  const {db, core, workStorage} = makeRealWorkspace()
  try {
    expect((await core.settingsService.loadSettings()).appearance.boardMode).toBe("normal")
    const storage = {workStorage} as StorageController
    await exerciseStatusContract(
      async (name, input) => {
        const tool = SHARED_TOOLS.find((candidate) => candidate.name === name)
        expect(tool).toBeDefined()
        const result = await tool!.execute(input, {storage, now: () => new Date(), caller: "in-app"})
        if (!result.success) throw new Error(result.error)
        return result.data
      },
      {kind: "agent", provider: "daily_agent"},
    )
  } finally {
    db.close()
  }
})
