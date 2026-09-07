import {addTaskTags} from "./addTaskTags"
import {createTag} from "./createTag"
import {deleteTag} from "./deleteTag"
import {getTag} from "./getTag"
import {listTags} from "./listTags"
import {removeTaskTags} from "./removeTaskTags"
import {updateTag} from "./updateTag"

import type {RegisteredTool} from "@main/ai/tools/registry/types"

export const TAG_TOOLS: RegisteredTool[] = [listTags, getTag, createTag, updateTag, deleteTag, addTaskTags, removeTaskTags]
