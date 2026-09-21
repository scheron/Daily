import {AISessionModel} from "./models/AISessionModel"
import {BranchModel} from "./models/BranchModel"
import {FileModel} from "./models/FileModel"
import {MilestoneModel} from "./models/MilestoneModel"
import {SettingsModel} from "./models/SettingsModel"
import {TagModel} from "./models/TagModel"
import {TaskEventModel} from "./models/TaskEventModel"
import {TaskModel} from "./models/TaskModel"
import {TaskRelationModel} from "./models/TaskRelationModel"
import {BranchesService} from "./services/BranchesService"
import {FilesService} from "./services/FilesService"
import {MilestonesService} from "./services/MilestonesService"
import {SearchService} from "./services/SearchService"
import {SettingsService} from "./services/SettingsService"
import {TagsService} from "./services/TagsService"
import {TaskEventsService} from "./services/TaskEventsService"
import {TaskRelationsService} from "./services/TaskRelationsService"
import {TasksService} from "./services/TasksService"
import {LocalStorageAdapter} from "./sync/adapters/LocalStorageAdapter"

import type {AppPaths} from "../config/paths"
import type {SqliteDriver} from "../database/SqliteDriver"
import type {StorageClock} from "../types/storage"

export type StorageCore = {
  settingsService: SettingsService
  branchesService: BranchesService
  tasksService: TasksService
  taskRelationsService: TaskRelationsService
  tagsService: TagsService
  milestonesService: MilestonesService
  filesService: FilesService
  searchService: SearchService
  localAdapter: LocalStorageAdapter
  aiSessionModel: AISessionModel
}

/** Constructs all models and services over an open database. Runs main-branch/asset bootstrapping. No sync engine, no search-index build, no auto-sync. */
export function createStorageCore(db: SqliteDriver, paths: AppPaths, clock?: StorageClock): StorageCore {
  const settingsModel = new SettingsModel(db)
  const branchModel = new BranchModel(db)
  const taskModel = new TaskModel(db)
  const taskEventModel = new TaskEventModel(db)
  const tagModel = new TagModel(db)
  const milestoneModel = new MilestoneModel(db)
  const taskRelationModel = new TaskRelationModel(db)
  const fileModel = new FileModel(db, paths.assetsDir())

  branchModel.ensureMainBranch()
  fileModel.initAssets()

  const settingsService = new SettingsService(settingsModel)

  return {
    settingsService,
    branchesService: new BranchesService(branchModel, settingsService, taskModel, tagModel, milestoneModel, db),
    tasksService: new TasksService(taskModel, new TaskEventsService(taskEventModel, clock), clock),
    taskRelationsService: new TaskRelationsService(taskRelationModel, taskModel),
    tagsService: new TagsService(tagModel),
    milestonesService: new MilestonesService(milestoneModel),
    filesService: new FilesService(fileModel, taskModel),
    searchService: new SearchService(taskModel, branchModel),
    localAdapter: new LocalStorageAdapter(db),
    aiSessionModel: new AISessionModel(db),
  }
}
