import {ref} from "vue"

import type {Subtask, TaskComment} from "@daily/protocol"

type NestedTarget = {kind: "subtask"; id: Subtask["id"]} | {kind: "comment"; id: TaskComment["id"]}

export const nestedTarget = ref<NestedTarget | null>(null)
