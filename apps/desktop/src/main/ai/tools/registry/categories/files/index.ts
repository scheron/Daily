import {getTaskAttachments} from "./getTaskAttachments"
import {removeTaskAttachment} from "./removeTaskAttachment"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const FILE_TOOLS: RegisteredTool[] = [getTaskAttachments, removeTaskAttachment]
