// @ts-nocheck
import {describe, expect, it} from "vitest"

import {parseCompatToolCalls, toolsToCompatPrompt} from "@main/ai/tools/compat"

import type {Tool} from "@main/ai/types"

const tool = (name: string, description: string, properties: Record<string, any> = {}, required: string[] = []): Tool => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {type: "object", properties, required},
  },
})

describe("toolsToCompatPrompt", () => {
  it("returns empty string when no tools", () => {
    expect(toolsToCompatPrompt([])).toBe("")
  })

  it("lists each tool with name and description", () => {
    const out = toolsToCompatPrompt([tool("list_tasks", "List tasks for a date"), tool("respond", "Send final reply")])
    expect(out).toContain("list_tasks")
    expect(out).toContain("List tasks for a date")
    expect(out).toContain("respond")
    expect(out).toContain("Send final reply")
  })

  it("includes parameter schema when properties are present", () => {
    const out = toolsToCompatPrompt([tool("list_tasks", "List tasks", {date: {type: "string", description: "ISO date"}}, ["date"])])
    expect(out).toContain("date")
    expect(out).toContain("string")
  })

  it("shows the tool_call fenced block format example", () => {
    const out = toolsToCompatPrompt([tool("x", "x")])
    expect(out).toMatch(/```tool_call/)
    expect(out).toContain(`"name"`)
    expect(out).toContain(`"arguments"`)
  })
})

describe("parseCompatToolCalls", () => {
  it("returns empty arrays for null or empty content", () => {
    expect(parseCompatToolCalls(null)).toEqual({toolCalls: [], remainingContent: ""})
    expect(parseCompatToolCalls("")).toEqual({toolCalls: [], remainingContent: ""})
  })

  it("returns empty toolCalls and original content when no tool_call fences", () => {
    const out = parseCompatToolCalls("Just a plain answer.")
    expect(out.toolCalls).toEqual([])
    expect(out.remainingContent).toBe("Just a plain answer.")
  })

  it("extracts a single tool_call block", () => {
    const out = parseCompatToolCalls('Some text\n```tool_call\n{"name": "list_tasks", "arguments": {"date": "2026-06-05"}}\n```\nMore text')
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("list_tasks")
    expect(out.toolCalls[0].function.arguments).toEqual({date: "2026-06-05"})
    expect(out.toolCalls[0].type).toBe("function")
    expect(out.toolCalls[0].id).toBeTruthy()
    expect(out.remainingContent).toContain("Some text")
    expect(out.remainingContent).toContain("More text")
    expect(out.remainingContent).not.toContain("tool_call")
  })

  it("extracts multiple tool_call blocks in order", () => {
    const out = parseCompatToolCalls(
      '```tool_call\n{"name": "a", "arguments": {}}\n```\nthen\n```tool_call\n{"name": "b", "arguments": {"x": 1}}\n```',
    )
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(["a", "b"])
    expect(out.toolCalls[1].function.arguments).toEqual({x: 1})
  })

  it("skips malformed JSON blocks but keeps valid ones", () => {
    const out = parseCompatToolCalls('```tool_call\nnot json\n```\n```tool_call\n{"name": "ok", "arguments": {}}\n```')
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("ok")
  })

  it("skips blocks missing the name field", () => {
    const out = parseCompatToolCalls('```tool_call\n{"arguments": {"a":1}}\n```')
    expect(out.toolCalls).toHaveLength(0)
  })

  it("defaults arguments to empty object when missing", () => {
    const out = parseCompatToolCalls('```tool_call\n{"name": "ping"}\n```')
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.arguments).toEqual({})
  })

  it("assigns unique ids per call", () => {
    const out = parseCompatToolCalls('```tool_call\n{"name": "a"}\n```\n```tool_call\n{"name": "b"}\n```')
    const ids = out.toolCalls.map((t) => t.id)
    expect(new Set(ids).size).toBe(2)
  })

  it("parses Qwen-native XML format: <tool_call>{json}</tool_call>", () => {
    const content = 'pre\n<tool_call>\n{"name": "list_tasks", "arguments": {"date": "2026-06-05"}}\n</tool_call>\npost'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("list_tasks")
    expect(out.toolCalls[0].function.arguments).toEqual({date: "2026-06-05"})
    expect(out.remainingContent).toContain("pre")
    expect(out.remainingContent).toContain("post")
    expect(out.remainingContent).not.toContain("tool_call")
  })

  it("parses Hermes-style XML+function format", () => {
    const content = '<tool_call>\n<function=respond>\n{"text": "Hello"}\n</function>\n</tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("respond")
    expect(out.toolCalls[0].function.arguments).toEqual({text: "Hello"})
  })

  it("mixes fenced and XML formats in one response", () => {
    const content = '```tool_call\n{"name": "list_tasks"}\n```\nthen\n<tool_call>\n{"name": "respond", "arguments": {"text": "ok"}}\n</tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(["list_tasks", "respond"])
  })

  it("tolerates single-quoted JSON inside tool_call", () => {
    const content = `<tool_call>{'name': 'respond', 'arguments': {'text': 'hi'}}</tool_call>`
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("respond")
    expect(out.toolCalls[0].function.arguments).toEqual({text: "hi"})
  })

  it("tolerates unquoted object keys inside tool_call", () => {
    const content = '<tool_call><function=respond>{"text": "yo"}</function></tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.arguments).toEqual({text: "yo"})
  })

  it("parses Qwen3.5 bare-named-tag format: <tool_call><NAME>{json}</NAME></tool_call>", () => {
    const content = '<tool_call>\n<respond>{"text": "Hi"}</respond>\n</tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("respond")
    expect(out.toolCalls[0].function.arguments).toEqual({text: "Hi"})
  })

  it("aliases common name typos to canonical tool names", () => {
    // Qwen3.5 sometimes emits <response> when it should be <respond>.
    const content = '<tool_call>\n<response>{"text": "Done"}</response>\n</tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls).toHaveLength(1)
    expect(out.toolCalls[0].function.name).toBe("respond")
    expect(out.toolCalls[0].function.arguments).toEqual({text: "Done"})
  })

  it("handles back-to-back tool_call blocks (no separator)", () => {
    // The exact pattern seen in Qwen3.5 output.
    const content =
      '<tool_call>\n{"name": "list_tasks", "arguments": {"date": "2026-06-05"}}\n</tool_call><tool_call>\n<response>{"text": "Done."}</response>\n</tool_call>'
    const out = parseCompatToolCalls(content)
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(["list_tasks", "respond"])
  })
})
