import type {ISODate} from "./date"

export type Settings = {
  themes: {
    use_system: boolean
    preferred_light: string
    preferred_dark: string
    current: string
  }

  sidebar: {
    collapsed: boolean
  }
}

export type ExportDayData = {
  date: ISODate
  tasks: Array<{
    filename: string
    content: string
  }>
}
