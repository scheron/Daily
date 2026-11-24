import {stringify} from "yaml"

import type {Subtask, Task} from "@daily/protocol"

/** Serializes a saved task and its already-ordered subtasks as raw version 1 YAML without line wrapping. */
export function toTaskYaml(task: Pick<Task, "id" | "content">, subtasks: readonly Pick<Subtask, "id" | "done" | "content">[]): string {
  return stringify(
    {
      version: 1,
      id: task.id,
      content: task.content,
      subtasks: subtasks.map(({id, done, content}) => ({id, done, content})),
    },
    {lineWidth: 0},
  )
}
