export const SHORTCUTS_MAP = {
  "tasks:create": {channel: "shortcut:tasks:create", label: "New Task", accelerator: "CmdOrCtrl+N"},

  "ui:left-panel:toggle": {channel: "shortcut:ui:left-panel:toggle", label: "Toggle Left Panel", accelerator: "CmdOrCtrl+E"},

  // Settings
  "ui:open-search-panel": {channel: "shortcut:ui:open-search-panel", label: "Search", accelerator: "CmdOrCtrl+F"},
  "ui:open-assistant-panel": {channel: "shortcut:ui:open-assistant-panel", label: "AI Assistant", accelerator: "CmdOrCtrl+Shift+A"},
  "ui:open-settings-panel": {channel: "shortcut:ui:open-settings-panel", label: "Settings", accelerator: "CmdOrCtrl+,"},
  "settings:general": {channel: "settings:open:general", label: "General", accelerator: "CmdOrCtrl+Shift+1", section: "general"},
  "settings:workflow": {channel: "settings:open:workflow", label: "Workflow", accelerator: "CmdOrCtrl+Shift+2", section: "workflow"},
  "settings:icloud": {channel: "settings:open:icloud", label: "Remote", accelerator: "CmdOrCtrl+Shift+3", section: "icloud"},
  "settings:ai": {channel: "settings:open:ai", label: "AI", accelerator: "CmdOrCtrl+Shift+4", section: "ai"},
  "settings:debug": {channel: "settings:open:debug", label: "DEBUG", accelerator: "CmdOrCtrl+Shift+5", section: "debug"},

  // Local
  "editor:close": {label: "Close", accelerator: "Escape"},
  "editor:save": {label: "Save", accelerator: "CmdOrCtrl+S"},
  "editor:save-close": {label: "Save & Close", accelerator: "CmdOrCtrl+Enter"},
} as const
