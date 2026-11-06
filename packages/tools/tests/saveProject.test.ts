import {describe, expect, it} from "vitest"

import {listProjectsTool} from "../src/read/listProjects"
import {saveProjectTool} from "../src/write/saveProject"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {ProjectView} from "../src/views"

describe("save_project", () => {
  it("preserves a project's emoji through agent text edits and exposes it in project lists", async () => {
    const {ctx} = makeRealWorkspace()
    const created = (await saveProjectTool.run({name: "Launch", emoji: "👩🏽‍🚀"}, ctx)) as {project: ProjectView}
    expect(created.project).toMatchObject({name: "Launch", emoji: "👩🏽‍🚀"})
    const renamed = (await saveProjectTool.run({id: created.project.id, name: "Space", description: "Mission"}, ctx)) as {project: ProjectView}
    expect(renamed.project).toMatchObject({name: "Space", description: "Mission", emoji: "👩🏽‍🚀"})
    expect(await listProjectsTool.run({}, ctx)).toMatchObject({projects: expect.arrayContaining([renamed.project])})
    const cleared = (await saveProjectTool.run({id: created.project.id, emoji: null}, ctx)) as {project: ProjectView}
    expect(cleared.project).toMatchObject({emoji: null})
  })

  it("rejects invalid emoji before creating a project", async () => {
    const {ctx} = makeRealWorkspace()
    await expect(saveProjectTool.run({name: "Bad", emoji: "text"}, ctx)).rejects.toThrow('"emoji"')
    expect(await ctx.workStorage.getBranchList()).toEqual([expect.objectContaining({id: "main"})])
  })
})
