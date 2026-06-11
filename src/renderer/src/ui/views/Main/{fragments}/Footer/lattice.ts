import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {Day} from "@shared/types/storage"

export const WEEKS_PER_CHUNK = 5
export const DAYS_PER_CHUNK = WEEKS_PER_CHUNK * 7
/** Day cell box size in px; also drives all viewport math */
export const CELL_SIZE = 36
/** Horizontal padding inside one chunk block, px */
export const CHUNK_PADDING_X = 12
export const CHUNK_WIDTH = CELL_SIZE * 7 + CHUNK_PADDING_X * 2
/** Fixed epoch Monday; chunk boundaries never move relative to it */
export const LATTICE_EPOCH: ISODate = "2001-01-01"

export type DayDotStatus = "active" | "done"

export type LatticeChunk = {
  index: number
  /** Monday opening the chunk */
  startDate: ISODate
  /** 18th of 35 days (middle row, Thursday); defines the chunk's month label */
  middleDate: ISODate
  /** 5 rows (weeks) × 7 columns (Mon..Sun) */
  weeks: ISODate[][]
}

export function chunkIndexForDate(date: ISODate): number {
  return Math.floor(daysFromEpoch(date) / DAYS_PER_CHUNK)
}

export function buildChunk(index: number): LatticeChunk {
  const start = EPOCH_DATE.plus({days: index * DAYS_PER_CHUNK})
  const weeks: ISODate[][] = []

  for (let row = 0; row < WEEKS_PER_CHUNK; row++) {
    const week: ISODate[] = []
    for (let col = 0; col < 7; col++) {
      week.push(start.plus({days: row * 7 + col}).toISODate()!)
    }
    weeks.push(week)
  }

  return {
    index,
    startDate: start.toISODate()!,
    middleDate: start.plus({days: Math.floor(DAYS_PER_CHUNK / 2)}).toISODate()!,
    weeks,
  }
}

export function buildChunkRange(from: ISODate, to: ISODate): LatticeChunk[] {
  const chunks: LatticeChunk[] = []
  for (let i = chunkIndexForDate(from); i <= chunkIndexForDate(to); i++) {
    chunks.push(buildChunk(i))
  }
  return chunks
}

export function getDayDotStatus(day: Day | null | undefined): DayDotStatus | null {
  if (!day || day.tasks.length === 0) return null
  return day.countActive > 0 ? "active" : "done"
}

/** Date shown at the horizontal center of the viewport (middle row of the centered column) */
export function dateAtViewportCenter(params: {scrollLeft: number; clientWidth: number; firstChunkIndex: number}): ISODate {
  const centerX = params.scrollLeft + params.clientWidth / 2
  const chunkOffset = Math.floor(centerX / CHUNK_WIDTH)
  const xInChunk = centerX - chunkOffset * CHUNK_WIDTH - CHUNK_PADDING_X
  const col = Math.min(6, Math.max(0, Math.floor(xInChunk / CELL_SIZE)))
  const middleRow = Math.floor(WEEKS_PER_CHUNK / 2)
  const dayOffset = (params.firstChunkIndex + chunkOffset) * DAYS_PER_CHUNK + middleRow * 7 + col

  return EPOCH_DATE.plus({days: dayOffset}).toISODate()!
}

/** scrollLeft that horizontally centers the chunk containing the date */
export function scrollLeftForDate(params: {date: ISODate; firstChunkIndex: number; clientWidth: number}): number {
  const chunkOffset = chunkIndexForDate(params.date) - params.firstChunkIndex
  return Math.max(0, chunkOffset * CHUNK_WIDTH - (params.clientWidth - CHUNK_WIDTH) / 2)
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

const EPOCH_DATE = DateTime.fromISO(LATTICE_EPOCH)

function daysFromEpoch(date: ISODate): number {
  return Math.round(DateTime.fromISO(date).diff(EPOCH_DATE, "days").days)
}
