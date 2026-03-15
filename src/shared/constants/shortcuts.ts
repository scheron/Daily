export const ShortcutsMap = {
  "tasks:create": {
    channel: "shortcut:tasks:create",
    label: "New Task",
    accelerator: "CmdOrCtrl+N",
  },

  "ui:open-search-panel": {
    channel: "shortcut:ui:open-search-panel",
    label: "Search",
    accelerator: "CmdOrCtrl+F",
  },

  "ui:open-assistant-panel": {
    channel: "shortcut:ui:open-assistant-panel",
    label: "AI Assistant",
    accelerator: "CmdOrCtrl+Shift+A",
  },

  "ui:open-settings-panel": {
    channel: "shortcut:ui:open-settings-panel",
    label: "Settings",
    accelerator: "CmdOrCtrl+,",
  },

  "ui:toggle-tasks-view-mode": {
    channel: "shortcut:ui:toggle-tasks-view-mode",
    label: "Toggle List/Columns view",
    accelerator: "CmdOrCtrl+\\",
  },

  "settings:themes": {
    channel: "settings:open:appearance",
    label: "Themes",
    accelerator: "CmdOrCtrl+Shift+1",
    section: "appearance",
  },

  "settings:tags": {
    channel: "settings:open:workspace",
    label: "Tags",
    accelerator: "CmdOrCtrl+Shift+2",
    section: "workspace",
  },

  "settings:ai": {
    channel: "settings:open:ai",
    label: "AI Settings",
    accelerator: "CmdOrCtrl+Shift+3",
    section: "ai",
  },

  "settings:sync": {
    channel: "settings:open:sync",
    label: "iCloud Settings",
    accelerator: "CmdOrCtrl+Shift+4",
    section: "sync",
  },

  "settings:deleted-tasks": {
    channel: "settings:open:deleted-tasks",
    label: "Deleted Tasks",
    accelerator: "CmdOrCtrl+Shift+5",
    section: "deleted-tasks",
  },
} as const
