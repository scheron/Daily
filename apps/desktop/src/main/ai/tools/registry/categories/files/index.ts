import {getTaskAttachments} from "./getTaskAttachments"
import {removeTaskAttachment} from "./removeTaskAttachment"

import type {RegisteredTool} from "../../types"

export const FILE_TOOLS: RegisteredTool[] = [getTaskAttachments, removeTaskAttachment]
