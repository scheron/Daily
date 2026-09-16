import {completeTask} from "./completeTask"
import {createTask} from "./createTask"
import {deleteTask} from "./deleteTask"
import {discardTask} from "./discardTask"
import {getDeletedTasks} from "./getDeletedTasks"
import {getTask} from "./getTask"
import {linkTasks} from "./linkTasks"
import {listTasks} from "./listTasks"
import {logTime} from "./logTime"
import {moveTask} from "./moveTask"
import {permanentlyDeleteTask} from "./permanentlyDeleteTask"
import {reactivateTask} from "./reactivateTask"
import {restoreTask} from "./restoreTask"
import {searchTasks} from "./searchTasks"
import {unlinkTasks} from "./unlinkTasks"
import {updateTask} from "./updateTask"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const TASK_TOOLS: RegisteredTool[] = [
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  discardTask,
  reactivateTask,
  deleteTask,
  getDeletedTasks,
  restoreTask,
  permanentlyDeleteTask,
  searchTasks,
  moveTask,
  linkTasks,
  unlinkTasks,
  logTime,
]
