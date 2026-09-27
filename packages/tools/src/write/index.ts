import {deleteAttachmentTool} from "./deleteAttachment"
import {deleteCommentTool} from "./deleteComment"
import {deleteMilestoneTool} from "./deleteMilestone"
import {deleteProjectTool} from "./deleteProject"
import {deleteTagTool} from "./deleteTag"
import {deleteTaskTool} from "./deleteTask"
import {saveAttachmentTool} from "./saveAttachment"
import {saveCommentTool} from "./saveComment"
import {saveMilestoneTool} from "./saveMilestone"
import {saveProjectTool} from "./saveProject"
import {saveTagTool} from "./saveTag"
import {saveTaskTool} from "./saveTask"

import type {Tool} from "../types"

export const WRITE_TOOLS: readonly Tool[] = [
  saveTaskTool,
  deleteTaskTool,
  saveCommentTool,
  deleteCommentTool,
  saveProjectTool,
  deleteProjectTool,
  saveMilestoneTool,
  deleteMilestoneTool,
  saveTagTool,
  deleteTagTool,
  saveAttachmentTool,
  deleteAttachmentTool,
]
