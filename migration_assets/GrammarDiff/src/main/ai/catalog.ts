import fs from "fs-extra"

import {logger} from "@/utils/logger"

import type {ModelManifestEntry} from "./types"

export async function loadCatalog(filePath: string): Promise<ModelManifestEntry[]> {
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch (err) {
    logger.error(logger.CONTEXT.AI, "Failed to read model catalog", {filePath, error: err})
    return []
  }
  if (!Array.isArray(raw)) {
    logger.error(logger.CONTEXT.AI, "Model catalog is not an array", {filePath})
    return []
  }
  const out: ModelManifestEntry[] = []
  raw.forEach((item, index) => {
    const entry = parseEntry(item, index)
    if (entry) out.push(entry)
  })
  return out
}

function parseEntry(raw: unknown, index: number): ModelManifestEntry | null {
  const reject = (reason: string): null => {
    logger.warn(logger.CONTEXT.AI, "Skipping invalid catalog entry", {index, reason})
    return null
  }
  const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
  const inUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1

  if (typeof raw !== "object" || raw === null) return reject("not an object")
  const e = raw as Record<string, unknown>

  const id = e.id
  if (!isStr(id)) return reject("id")
  const title = e.title
  if (!isStr(title)) return reject(`${id}: title`)
  const description = e.description
  if (!isStr(description)) return reject(`${id}: description`)
  const ggufUrl = e.ggufUrl
  if (!isStr(ggufUrl)) return reject(`${id}: ggufUrl`)
  const ggufFilename = e.ggufFilename
  if (!isStr(ggufFilename)) return reject(`${id}: ggufFilename`)
  const sizeBytes = e.sizeBytes
  if (!isNum(sizeBytes) || sizeBytes <= 0) return reject(`${id}: sizeBytes`)

  const req = e.requirements as Record<string, unknown> | undefined
  const ramGb = req?.ramGb
  const diskGb = req?.diskGb
  if (!isNum(ramGb) || !isNum(diskGb)) return reject(`${id}: requirements`)

  const sa = e.serverArgs as Record<string, unknown> | undefined
  const ctx = sa?.ctx
  const gpuLayers = sa?.gpuLayers
  const temperature = sa?.temperature
  if (!isNum(ctx) || !isNum(gpuLayers) || !isNum(temperature)) return reject(`${id}: serverArgs`)

  const accuracy = e.accuracy
  if (!inUnit(accuracy)) return reject(`${id}: accuracy`)
  if (e.recommended !== undefined && typeof e.recommended !== "boolean") return reject(`${id}: recommended`)
  if (e.sha256 !== undefined && !isStr(e.sha256)) return reject(`${id}: sha256`)
  if (e.disableThinking !== undefined && typeof e.disableThinking !== "boolean") return reject(`${id}: disableThinking`)

  const entry: ModelManifestEntry = {
    id,
    title,
    description,
    sizeBytes,
    requirements: {ramGb, diskGb},
    ggufUrl,
    ggufFilename,
    serverArgs: {ctx, gpuLayers, temperature},
    accuracy,
  }
  if (typeof e.recommended === "boolean") entry.recommended = e.recommended
  if (isStr(e.sha256)) entry.sha256 = e.sha256
  if (typeof e.disableThinking === "boolean") entry.disableThinking = e.disableThinking
  return entry
}
