export type Settings = {
  themes: {
    useSystem: boolean
    preferredLight: string
    preferredDark: string
    current: string
  }

  sidebar: {
    collapsed: boolean
  }

  paths: {
    root: string
  }
}