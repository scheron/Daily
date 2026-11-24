import {describe, expect, it} from "vitest"
import {parse as parseYaml} from "yaml"

import {toTaskYaml} from "../../../../src/renderer/src/utils/tasks/toTaskYaml"
import {makeSubtask, makeTask} from "../../../helpers/taskFixtures"

describe("toTaskYaml", () => {
  it("serializes a task with empty subtasks as raw version 1 YAML without extra task fields [task-copy#yaml-structure]", () => {
    const task = makeTask({
      id: "task:abc",
      content: "Ship copy feature",
      status: "in_progress",
      priority: "urgent",
    })

    const yaml = toTaskYaml(task, [])

    expect(yaml).toBe("version: 1\nid: task:abc\ncontent: Ship copy feature\nsubtasks: []\n")
    expect(yaml).not.toContain("```")
    expect(parseYaml(yaml)).toEqual({
      version: 1,
      id: "task:abc",
      content: "Ship copy feature",
      subtasks: [],
    })
  })

  it("preserves caller subtask order and omits internal subtask metadata [task-copy#yaml-structure]", () => {
    const task = makeTask({id: "task-1", content: "Parent"})
    const subtasks = [
      makeSubtask({id: "sub-z", done: true, content: "First by list", orderKey: "z"}),
      makeSubtask({id: "sub-a", done: false, content: "Second by list", orderKey: "a"}),
      makeSubtask({id: "sub-m", done: true, content: "Third by list", orderKey: "m"}),
    ]

    const yaml = toTaskYaml(task, subtasks)

    expect(parseYaml(yaml)).toEqual({
      version: 1,
      id: "task-1",
      content: "Parent",
      subtasks: [
        {id: "sub-z", done: true, content: "First by list"},
        {id: "sub-a", done: false, content: "Second by list"},
        {id: "sub-m", done: true, content: "Third by list"},
      ],
    })
  })

  it("keeps multi-line Markdown, raw HTML, daily links, and long lines unwrapped [task-copy#yaml-structure]", () => {
    const longLine = "Long single line exceeding eighty characters without wrapping when serialized to YAML for agents and editors to read verbatim."
    const content = `# Release notes\n\n- [x] Done item\n- [ ] Pending item\n\n<div class="callout">Raw <strong>HTML</strong> &amp; note</div>\n\n![spec](daily://file/file-123)\n\n${longLine}`
    const task = makeTask({id: "task-2", content})

    const yaml = toTaskYaml(task, [])

    expect(yaml).toContain("content: |-\n")
    expect(yaml).toContain(`  ${longLine}\n`)
    expect(parseYaml(yaml)).toEqual({
      version: 1,
      id: "task-2",
      content,
      subtasks: [],
    })
  })

  it("round-trips fenced code blocks, quotes, and --- document separators losslessly [task-copy#yaml-structure]", () => {
    const taskContent = '---\nlayout: "post"\n\'single\': true\n---\n\n```yaml\n---\nkey: "value"\n```\n'
    const subtaskContent = '---\nCheck `const q = "a" + \'b\'`\n```ts\nconsole.log("---")\n```'
    const task = makeTask({id: "task-3", content: taskContent})
    const subtasks = [makeSubtask({id: "sub-1", done: false, content: subtaskContent})]

    const yaml = toTaskYaml(task, subtasks)

    expect(parseYaml(yaml)).toEqual({
      version: 1,
      id: "task-3",
      content: taskContent,
      subtasks: [{id: "sub-1", done: false, content: subtaskContent}],
    })
  })

  it("preserves trailing spaces and CRLF line endings losslessly [task-copy#yaml-structure]", () => {
    const crlf = "line one\r\nline two\r\n"
    const multiTrailing = "alpha   \nbeta  "
    const singleTrailing = "gamma   "

    expect(parseYaml(toTaskYaml(makeTask({id: "t-crlf", content: crlf}), []))).toEqual({
      version: 1,
      id: "t-crlf",
      content: crlf,
      subtasks: [],
    })
    expect(parseYaml(toTaskYaml(makeTask({id: "t-multi", content: multiTrailing}), []))).toEqual({
      version: 1,
      id: "t-multi",
      content: multiTrailing,
      subtasks: [],
    })
    expect(parseYaml(toTaskYaml(makeTask({id: "t-single", content: singleTrailing}), []))).toEqual({
      version: 1,
      id: "t-single",
      content: singleTrailing,
      subtasks: [],
    })
  })

  it("round-trips Unicode text and scalar-like identifiers verbatim [task-copy#yaml-structure]", () => {
    const content = "日本語 🚀 café naïve — “smart quotes” & combining e\u0301"
    const subtaskContent = "null"
    const task = makeTask({id: "123", content})
    const subtasks = [makeSubtask({id: "true", done: true, content: subtaskContent})]

    const yaml = toTaskYaml(task, subtasks)

    expect(parseYaml(yaml)).toStrictEqual({
      version: 1,
      id: "123",
      content,
      subtasks: [{id: "true", done: true, content: "null"}],
    })
  })
})
