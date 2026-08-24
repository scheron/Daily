import {completeTask} from "./completeTask"
import {createTask} from "./createTask"
import {deleteTask} from "./deleteTask"
import {discardTask} from "./discardTask"
import {getDeletedTasks} from "./getDeletedTasks"
import {getTask} from "./getTask"
import {listTasks} from "./listTasks"
import {logTime} from "./logTime"
import {moveTask} from "./moveTask"
import {permanentlyDeleteTask} from "./permanentlyDeleteTask"
import {reactivateTask} from "./reactivateTask"
import {restoreTask} from "./restoreTask"
import {searchTasks} from "./searchTasks"
import {updateTask} from "./updateTask"

import type {RegisteredTool} from "../../types"

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
  logTime,
]
