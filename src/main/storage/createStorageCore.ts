import {AISessionModel} from "@/storage/models/AISessionModel"
import {BranchModel} from "@/storage/models/BranchModel"
import {FileModel} from "@/storage/models/FileModel"
import {SettingsModel} from "@/storage/models/SettingsModel"
import {StatsModel} from "@/storage/models/StatsModel"
import {TagModel} from "@/storage/models/TagModel"
import {TaskEventModel} from "@/storage/models/TaskEventModel"
import {TaskModel} from "@/storage/models/TaskModel"
import {BranchesService} from "@/storage/services/BranchesService"
import {DaysService} from "@/storage/services/DaysService"
import {FilesService} from "@/storage/services/FilesService"
import {SearchService} from "@/storage/services/SearchService"
import {SettingsService} from "@/storage/services/SettingsService"
import {StatsService} from "@/storage/services/StatsService"
import {TagsService} from "@/storage/services/TagsService"
import {TaskEventsService} from "@/storage/services/TaskEventsService"
import {TasksService} from "@/storage/services/TasksService"
import {LocalStorageAdapter} from "@/storage/sync/adapters/LocalStorageAdapter"

import type {AppPaths} from "@shared/config/paths"
import type Database from "better-sqlite3"

export type StorageCore = {
  settingsService: SettingsService
  branchesService: BranchesService
  tasksService: TasksService
  tagsService: TagsService
  filesService: FilesService
  daysService: DaysService
  statsService: StatsService
  searchService: SearchService
  localAdapter: LocalStorageAdapter
  aiSessionModel: AISessionModel
}

/** Constructs all models and services over an open database. Runs main-branch/asset bootstrapping. No sync engine, no search-index build, no auto-sync. */
export function createStorageCore(db: Database.Database, paths: AppPaths): StorageCore {
  const settingsModel = new SettingsModel(db)
  const branchModel = new BranchModel(db)
  const taskModel = new TaskModel(db)
  const taskEventModel = new TaskEventModel(db)
  const tagModel = new TagModel(db)
  const fileModel = new FileModel(db, paths.assetsDir())

  branchModel.ensureMainBranch()
  fileModel.initAssets()

  const settingsService = new SettingsService(settingsModel)

  return {
    settingsService,
    branchesService: new BranchesService(branchModel, settingsService),
    tasksService: new TasksService(taskModel, new TaskEventsService(taskEventModel)),
    tagsService: new TagsService(tagModel),
    filesService: new FilesService(fileModel, taskModel),
    daysService: new DaysService(taskModel),
    statsService: new StatsService(new StatsModel(db)),
    searchService: new SearchService(taskModel, branchModel),
    localAdapter: new LocalStorageAdapter(db),
    aiSessionModel: new AISessionModel(db),
  }
}
