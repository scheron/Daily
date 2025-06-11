export type ColorScheme = {
  // Main Backgrounds
  "base-100": string
  // Background of canvas
  "base-200": string
  // Borders, 
  "base-300": string
  // Text & content
  "base-content": string

  // Accent 
  accent: string

  info: string
  success: string
  warning: string
  error: string
}

export type Theme = {
  id: string
  name: string
  type: "light" | "dark"
  colorScheme: ColorScheme
}
