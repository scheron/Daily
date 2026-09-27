import {describe, expect, it} from "vitest"

import {findTool, TOOLS} from "../src/index"

describe("the shared tool registry", () => {
  it("holds exactly the eighteen tools once each, reads before writes, each with a name, a description, a mode and an object input schema", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([
      "list_tasks",
      "get_task",
      "get_attachment",
      "list_projects",
      "list_milestones",
      "list_tags",
      "save_task",
      "delete_task",
      "save_comment",
      "delete_comment",
      "save_project",
      "delete_project",
      "save_milestone",
      "delete_milestone",
      "save_tag",
      "delete_tag",
      "save_attachment",
      "delete_attachment",
    ])
    expect(new Set(TOOLS.map((tool) => tool.name)).size).toBe(TOOLS.length)

    for (const tool of TOOLS) {
      expect(typeof tool.name).toBe("string")
      expect(typeof tool.description).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)
      expect(["read", "write", "delete"]).toContain(tool.mode)
      expect(tool.inputSchema.type).toBe("object")
      expect(typeof tool.inputSchema.properties).toBe("object")
    }
  })

  it("marks every delete_ tool as delete mode and no other tool as delete mode", () => {
    for (const tool of TOOLS) {
      const isNamedDelete = tool.name.startsWith("delete_")
      expect(tool.mode === "delete", `${tool.name} mode should be "delete" iff its name starts with "delete_"`).toBe(isNamedDelete)
    }
  })

  it("finds a tool by name and answers undefined for one that does not exist", () => {
    expect(findTool("save_task")?.name).toBe("save_task")
    expect(findTool("not_a_real_tool")).toBeUndefined()
  })
})
