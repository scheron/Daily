import fs from "fs-extra"

import {isArray, isBoolean, isNull, isNumber, isObject, isString, notNullish, notUndefined} from "@shared/utils/common/validators"
import {logger} from "@/utils/logger"

import type {ModelManifestEntry} from "../types"

const SUPPORTED_SCHEMA_VERSION = 1
const VALID_TIERS = new Set(["fast", "balanced", "quality"])

type RawCatalog = {schemaVersion?: number; models?: unknown[]}

export async function loadCatalog(filePath: string): Promise<ModelManifestEntry[]> {
  let raw: RawCatalog
  try {
    raw = JSON.parse(await fs.readFile(filePath, "utf8")) as RawCatalog
  } catch (err) {
    logger.error(logger.CONTEXT.AI, "Failed to read model catalog", {filePath, error: err})
    return []
  }

  if (raw?.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    logger.error(logger.CONTEXT.AI, "Unsupported catalog schemaVersion", {
      filePath,
      got: raw?.schemaVersion,
      expected: SUPPORTED_SCHEMA_VERSION,
    })
    return []
  }

  if (!isArray(raw.models)) {
    logger.error(logger.CONTEXT.AI, "Catalog 'models' is not an array", {filePath})
    return []
  }

  const out: ModelManifestEntry[] = []
  raw.models.forEach((item, index) => {
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
  const isStr = (v: unknown): v is string => isString(v) && v.length > 0
  const isNum = (v: unknown): v is number => isNumber(v) && Number.isFinite(v)
  const inUnitOrNull = (v: unknown): v is number | null => isNull(v) || (isNum(v) && v >= 0 && v <= 1)

  if (!isObject(raw)) return reject("not an object")
  const e = raw as Record<string, unknown>

  const id = e.id
  if (!isStr(id)) return reject("id")
  const title = e.title
  if (!isStr(title)) return reject(`${id}: title`)
  const description = e.description
  if (!isStr(description)) return reject(`${id}: description`)
  const tier = e.tier
  if (!isStr(tier) || !VALID_TIERS.has(tier)) return reject(`${id}: tier`)
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

  const optionalNumKeys = [
    "topP",
    "topK",
    "minP",
    "repeatPenalty",
    "repeatLastN",
    "presencePenalty",
    "frequencyPenalty",
    "dryMultiplier",
    "dryBase",
    "dryAllowedLength",
    "dryPenaltyLastN",
  ] as const
  for (const key of optionalNumKeys) {
    const v = sa?.[key]
    if (notUndefined(v) && !isNum(v)) return reject(`${id}: serverArgs.${key}`)
  }

  if (notNullish(e.sha256) && !isStr(e.sha256)) return reject(`${id}: sha256`)
  if (!inUnitOrNull(e.accuracy)) return reject(`${id}: accuracy`)
  if (notUndefined(e.recommended) && !isBoolean(e.recommended)) return reject(`${id}: recommended`)

  const optionalNumKeys2 = [...optionalNumKeys, "maxTokens"] as const
  for (const key of ["maxTokens"] as const) {
    const v = sa?.[key]
    if (notUndefined(v) && !isNum(v)) return reject(`${id}: serverArgs.${key}`)
  }

  const serverArgs: ModelManifestEntry["serverArgs"] = {ctx, gpuLayers, temperature}
  for (const key of optionalNumKeys2) {
    const v = sa?.[key]
    if (isNum(v)) (serverArgs as Record<string, number>)[key] = v
  }

  let capabilities: ModelManifestEntry["capabilities"]
  const rawCaps = e.capabilities as Record<string, unknown> | undefined
  if (notUndefined(rawCaps)) {
    const toolsCap = rawCaps.tools
    if (toolsCap !== "compat" && toolsCap !== "native") return reject(`${id}: capabilities.tools`)
    capabilities = {tools: toolsCap}
  }

  const entry: ModelManifestEntry = {
    id: id as ModelManifestEntry["id"],
    title,
    description,
    tier: tier as ModelManifestEntry["tier"],
    sizeBytes,
    requirements: {ramGb, diskGb},
    ggufUrl,
    ggufFilename,
    sha256: isStr(e.sha256) ? e.sha256 : null,
    serverArgs,
    accuracy: isNumber(e.accuracy) ? e.accuracy : null,
    recommended: e.recommended === true,
    ...(capabilities ? {capabilities} : {}),
  }
  return entry
}
