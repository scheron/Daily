import type {Correction, Mode} from "@shared/types/correction"
import type {Settings} from "@shared/types/settings"
import type {Database} from "better-sqlite3"

export type CorrectionRow = {
  id: string
  created_at: string
  mode: string
  original: string
  corrected: string
  model_id: string
  deleted_at: string | null
}

export type SettingsRow = {
  id: string
  version: string
  data: string
  created_at: string
  updated_at: string
}

export type CreateCorrectionInput = {
  id: string
  createdAt: string
  mode: Mode
  original: string
  corrected: string
  modelId: string
}

export interface IStorageController {
  init(db?: Database): Promise<void>
  dispose(): void

  setupStorageBroadcasts(callbacks: {onCorrectionAdded: (c: Correction) => void; onSettingsChanged: (s: Settings) => void}): void

  listCorrections(opts?: {limit?: number; beforeId?: string}): Promise<Correction[]>
  getCorrection(id: string): Promise<Correction | null>
  addCorrection(input: CreateCorrectionInput): Promise<Correction | null>
  clearCorrections(): Promise<number>

  loadSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
}
