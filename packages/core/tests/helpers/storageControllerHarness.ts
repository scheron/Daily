// @ts-nocheck
import {rmSync} from "node:fs"
import {nanoid} from "nanoid"
import {onTestFinished} from "vitest"

import {AISessionModel} from "@core/storage/models/AISessionModel"
import {BranchModel} from "@core/storage/models/BranchModel"
import {FileModel} from "@core/storage/models/FileModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {SettingsModel} from "@core/storage/models/SettingsModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskCommentModel} from "@core/storage/models/TaskCommentModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {TaskRelationModel} from "@core/storage/models/TaskRelationModel"
import {BranchesService} from "@core/storage/services/BranchesService"
import {FilesService} from "@core/storage/services/FilesService"
import {MilestonesService} from "@core/storage/services/MilestonesService"
import {SearchService} from "@core/storage/services/SearchService"
import {SettingsService} from "@core/storage/services/SettingsService"
import {TagsService} from "@core/storage/services/TagsService"
import {TaskCommentsService} from "@core/storage/services/TaskCommentsService"
import {TaskEventsService} from "@core/storage/services/TaskEventsService"
import {TaskRelationsService} from "@core/storage/services/TaskRelationsService"
import {TasksService} from "@core/storage/services/TasksService"
import {StorageController} from "@core/storage/StorageController"
import {LocalStorageAdapter} from "@core/storage/sync/adapters/LocalStorageAdapter"
import {createTestDatabase} from "./db"

export function makeTaskInput(overrides = {}) {
  return {
    id: nanoid(),
    status: "active",
    content: "Task",
    minimized: false,
    priority: "none",
    orderIndex: 1024,
    scheduled: {date: "2026-03-24", time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    deletedAt: null,
    ...overrides,
  }
}

function makeTestPaths() {
  const root = `/tmp/daily-test-${nanoid()}`
  onTestFinished(() => rmSync(root, {recursive: true, force: true}))

  return {
    appDataRoot: () => root,
    dbPath: () => `${root}/db`,
    assetsDir: () => `${root}/assets`,
    remoteSyncPath: () => `${root}/remote`,
  }
}

export function makeControllerHarness() {
  const db = createTestDatabase()
  const paths = makeTestPaths()

  const branchModel = new BranchModel(db)
  const taskModel = new TaskModel(db)
  const taskEventModel = new TaskEventModel(db)
  const tagModel = new TagModel(db)
  const milestoneModel = new MilestoneModel(db)
  const taskRelationModel = new TaskRelationModel(db)
  const taskCommentModel = new TaskCommentModel(db)
  const fileModel = new FileModel(db, paths.assetsDir())

  branchModel.ensureMainBranch()
  fileModel.initAssets()

  const settingsService = new SettingsService(new SettingsModel(db))
  const tasksService = new TasksService(taskModel, new TaskEventsService(taskEventModel))
  const branchesService = new BranchesService(branchModel, settingsService, taskModel, tagModel, milestoneModel, db)
  const taskRelationsService = new TaskRelationsService(taskRelationModel, taskModel)
  const taskCommentsService = new TaskCommentsService(taskCommentModel, taskModel)
  const tagsService = new TagsService(tagModel)
  const milestonesService = new MilestonesService(milestoneModel)
  const filesService = new FilesService(fileModel, taskModel)
  const searchService = new SearchService(taskModel, branchModel)
  const localAdapter = new LocalStorageAdapter(db, fileModel)
  const aiSessionModel = new AISessionModel(db)

  const controller = new StorageController(db, paths)
  controller.attachCore({
    settingsService,
    branchesService,
    tasksService,
    taskRelationsService,
    taskCommentsService,
    tagsService,
    milestonesService,
    filesService,
    searchService,
    localAdapter,
    aiSessionModel,
  })

  return {
    db,
    paths,
    controller,
    taskModel,
    branchModel,
    tagModel,
    milestoneModel,
    taskRelationModel,
    taskCommentModel,
    taskEventModel,
    fileModel,
    settingsService,
    branchesService,
    tasksService,
    taskRelationsService,
    taskCommentsService,
    tagsService,
    milestonesService,
    filesService,
    searchService,
    localAdapter,
    aiSessionModel,
  }
}

export function withBroadcasts(controller) {
  const broadcasts = []
  controller.setupStorageBroadcasts({
    onStatusChange: () => {},
    onDataChange: (changeset) => broadcasts.push(changeset),
    onSettingsChange: () => {},
  })
  return broadcasts
}
