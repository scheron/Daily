export const ShortcutsMap = {
  "tasks:create": {
    channel: "shortcut:tasks:create",
    label: "New Task",
    accelerator: "CmdOrCtrl+N",
  },

  "ui:toggle-sidebar": {
    channel: "shortcut:ui:toggle-sidebar",
    label: "Toggle Sidebar",
    accelerator: "CmdOrCtrl+I",
  },

  "ui:open-calendar-panel": {
    channel: "shortcut:ui:open-calendar-panel",
    label: "Calendar",
    accelerator: "CmdOrCtrl+Shift+C",
  },

  "ui:open-tags-panel": {
    channel: "shortcut:ui:open-tags-panel",
    label: "Tags",
    accelerator: "CmdOrCtrl+Shift+T",
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
} as const
