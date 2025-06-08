import type {ISODate} from "./date"

export type Settings = {
  theme: string
  sidebarCollapsed: boolean
}

export type ExportDayData = {
  date: ISODate
  tasks: Array<{
    filename: string
    content: string
  }>
}
