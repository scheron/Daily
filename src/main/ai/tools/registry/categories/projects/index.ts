import {createProject} from "./createProject"
import {deleteProject} from "./deleteProject"
import {listProjects} from "./listProjects"
import {moveTaskToProject} from "./moveTaskToProject"
import {renameProject} from "./renameProject"
import {switchProject} from "./switchProject"

import type {RegisteredTool} from "../../types"

export const PROJECT_TOOLS: RegisteredTool[] = [listProjects, createProject, renameProject, deleteProject, switchProject, moveTaskToProject]
