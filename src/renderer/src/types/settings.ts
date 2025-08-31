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

  paths: {
    root: string
  }

  tutorial: {
    completed: boolean
  }
}