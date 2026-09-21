import {getAttachmentTool} from "./getAttachment"
import {getTaskTool} from "./getTask"
import {listMilestonesTool} from "./listMilestones"
import {listProjectsTool} from "./listProjects"
import {listTagsTool} from "./listTags"
import {listTasksTool} from "./listTasks"

import type {AgentTool} from "../types"

export const READ_TOOLS: readonly AgentTool[] = [listTasksTool, getTaskTool, getAttachmentTool, listProjectsTool, listMilestonesTool, listTagsTool]
