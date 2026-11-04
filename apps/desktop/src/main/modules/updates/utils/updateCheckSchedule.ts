import {mkdir, readFile, rename, writeFile} from "node:fs/promises"
import path from "node:path"

import {logger} from "@daily/core"

import {electronPaths} from "@main/config/electronPaths"

export type UpdateCheckSchedule = {
  nextCheckAt: number
  restNotBefore: number
  fallbackFailures: number
}

export async function readUpdateCheckSchedule(): Promise<UpdateCheckSchedule> {
  try {
    const schedule = JSON.parse(await readFile(schedulePath(), "utf8")) as Partial<UpdateCheckSchedule> | null
    return {
      nextCheckAt: readNonNegativeInteger(schedule?.nextCheckAt),
      restNotBefore: readNonNegativeInteger(schedule?.restNotBefore),
      fallbackFailures: readNonNegativeInteger(schedule?.fallbackFailures),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logger.warn(logger.CONTEXT.UPDATES, "Failed to read update check schedule", error)
    return {nextCheckAt: 0, restNotBefore: 0, fallbackFailures: 0}
  }
}

export async function writeUpdateCheckSchedule(schedule: UpdateCheckSchedule): Promise<void> {
  const filename = schedulePath()
  const tempFile = `${filename}.tmp`
  try {
    await mkdir(path.dirname(filename), {recursive: true})
    await writeFile(tempFile, JSON.stringify(schedule), {mode: 0o600})
    await rename(tempFile, filename)
  } catch (error) {
    logger.warn(logger.CONTEXT.UPDATES, "Failed to save update check schedule", error)
  }
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function schedulePath(): string {
  return path.join(electronPaths.updatesPath(), "schedule.json")
}
