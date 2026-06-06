// @ts-nocheck
import {describe, expect, it} from "vitest"

import {ChatStreamAccumulator} from "@main/ai/clients/common/streaming/chatStreamAccumulator"

import type {ChatStreamDelta} from "@main/ai/types"

function emitter() {
  const deltas: ChatStreamDelta[] = []
  return {emit: (d: ChatStreamDelta) => deltas.push(d), deltas}
}

describe("ChatStreamAccumulator", () => {
  it("accumulates plain content deltas", () => {
    const acc = new ChatStreamAccumulator()
    const {emit, deltas} = emitter()
    acc.feed({content: "Hello"}, emit)
    acc.feed({content: " world"}, emit)
    acc.flush(emit)
    expect(deltas).toEqual([
      {kind: "content", text: "Hello"},
      {kind: "content", text: " world"},
    ])
    const msg = acc.toMessage()
    expect(msg.role).toBe("assistant")
    expect(msg.content).toBe("Hello world")
    expect(msg.tool_calls).toBeUndefined()
  })

  it("routes reasoning_content directly to reasoning channel", () => {
    const acc = new ChatStreamAccumulator()
    const {emit, deltas} = emitter()
    acc.feed({reasoning_content: "thinking..."}, emit)
    acc.feed({content: "answer"}, emit)
    acc.flush(emit)
    expect(deltas).toEqual([
      {kind: "reasoning", text: "thinking..."},
      {kind: "content", text: "answer"},
    ])
    expect(acc.toMessage().content).toBe("answer")
  })

  it("splits inline <think> blocks in content deltas", () => {
    const acc = new ChatStreamAccumulator()
    const {emit, deltas} = emitter()
    acc.feed({content: "<think>hmm</think>ok"}, emit)
    acc.flush(emit)
    expect(deltas).toEqual([
      {kind: "reasoning", text: "hmm"},
      {kind: "content", text: "ok"},
    ])
    expect(acc.toMessage().content).toBe("ok")
  })

  it("accumulates tool_calls across deltas", () => {
    const acc = new ChatStreamAccumulator()
    const {emit, deltas} = emitter()
    acc.feed({tool_calls: [{index: 0, id: "c1", type: "function", function: {name: "list_tasks"}}]}, emit)
    acc.feed({tool_calls: [{index: 0, function: {arguments: '{"date":'}}]}, emit)
    acc.feed({tool_calls: [{index: 0, function: {arguments: '"2026-06-05"}'}}]}, emit)
    acc.flush(emit)
    expect(deltas).toEqual([]) // tool deltas NOT emitted to UI
    const msg = acc.toMessage()
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls?.[0]).toMatchObject({
      id: "c1",
      type: "function",
      function: {name: "list_tasks", arguments: {date: "2026-06-05"}},
    })
  })

  it("falls back to string arguments when JSON parse fails", () => {
    const acc = new ChatStreamAccumulator()
    const {emit} = emitter()
    acc.feed({tool_calls: [{index: 0, id: "c1", type: "function", function: {name: "x", arguments: "not-json"}}]}, emit)
    acc.flush(emit)
    expect(acc.toMessage().tool_calls?.[0].function.arguments).toBe("not-json")
  })

  it("accumulates multiple tool_calls at different indices", () => {
    const acc = new ChatStreamAccumulator()
    const {emit} = emitter()
    acc.feed(
      {
        tool_calls: [
          {index: 0, id: "a", type: "function", function: {name: "X", arguments: "{}"}},
          {index: 1, id: "b", type: "function", function: {name: "Y", arguments: "{}"}},
        ],
      },
      emit,
    )
    acc.flush(emit)
    const msg = acc.toMessage()
    expect(msg.tool_calls).toHaveLength(2)
    expect(msg.tool_calls?.map((t) => t.id).sort()).toEqual(["a", "b"])
  })

  it("flush drains trailing splitter buffer (unclosed think)", () => {
    const acc = new ChatStreamAccumulator()
    const {emit, deltas} = emitter()
    acc.feed({content: "<think>still thinking"}, emit)
    acc.flush(emit)
    expect(deltas).toEqual([{kind: "reasoning", text: "still thinking"}])
  })

  it("hasEmittedAny is false until first delta, true after", () => {
    const acc = new ChatStreamAccumulator()
    const {emit} = emitter()
    expect(acc.hasEmittedAny()).toBe(false)
    acc.feed({content: "x"}, emit)
    expect(acc.hasEmittedAny()).toBe(true)
  })

  it("does not flip hasEmittedAny when only tool_calls arrive", () => {
    const acc = new ChatStreamAccumulator()
    const {emit} = emitter()
    acc.feed({tool_calls: [{index: 0, id: "c", type: "function", function: {name: "n", arguments: "{}"}}]}, emit)
    expect(acc.hasEmittedAny()).toBe(false)
  })
})
