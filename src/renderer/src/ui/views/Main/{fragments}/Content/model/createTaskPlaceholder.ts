import {MAIN_BRANCH_ID} from "@shared/constants/storage"

import {NEW_TASK_ID} from "./constants"

import type {ISODate} from "@shared/types/common"
import type {Task} from "@shared/types/storage"

export function createTaskPlaceholder(date: ISODate): Task {
  return {
    id: NEW_TASK_ID,
    content: "",
    status: "active",
    minimized: false,
    orderIndex: Number.MAX_SAFE_INTEGER,
    tags: [],
    estimatedTime: 0,
    spentTime: 0,
    deletedAt: null,
    branchId: MAIN_BRANCH_ID,
    attachments: [],
    scheduled: {
      date,
      time: new Date().toTimeString().slice(0, 8),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
