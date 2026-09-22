import {deleteCommentTool} from "./deleteComment"
import {deleteTaskTool} from "./deleteTask"
import {saveCommentTool} from "./saveComment"
import {saveMilestoneTool} from "./saveMilestone"
import {saveProjectTool} from "./saveProject"
import {saveTagTool} from "./saveTag"
import {saveTaskTool} from "./saveTask"

import type {AgentTool} from "../types"

export const WRITE_TOOLS: readonly AgentTool[] = [
  saveTaskTool,
  deleteTaskTool,
  saveCommentTool,
  deleteCommentTool,
  saveProjectTool,
  saveMilestoneTool,
  saveTagTool,
]
