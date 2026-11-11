import {getAttachmentTool} from "./getAttachment"
import {getTaskTool} from "./getTask"
import {getTaskWorkflowTool} from "./getTaskWorkflow"
import {listMilestonesTool} from "./listMilestones"
import {listProjectsTool} from "./listProjects"
import {listTagsTool} from "./listTags"
import {listTasksTool} from "./listTasks"

import type {Tool} from "../types"

export const READ_TOOLS: readonly Tool[] = [
  listTasksTool,
  getTaskTool,
  getTaskWorkflowTool,
  getAttachmentTool,
  listProjectsTool,
  listMilestonesTool,
  listTagsTool,
]
