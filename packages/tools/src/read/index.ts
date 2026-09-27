import {getAttachmentTool} from "./getAttachment"
import {getTaskTool} from "./getTask"
import {listMilestonesTool} from "./listMilestones"
import {listProjectsTool} from "./listProjects"
import {listTagsTool} from "./listTags"
import {listTasksTool} from "./listTasks"

import type {Tool} from "../types"

export const READ_TOOLS: readonly Tool[] = [listTasksTool, getTaskTool, getAttachmentTool, listProjectsTool, listMilestonesTool, listTagsTool]
