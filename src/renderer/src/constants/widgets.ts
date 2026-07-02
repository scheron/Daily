import type {WidgetDef, WidgetId, WidgetLayout} from "../types/widgets"

export const WIDGET_DEFS = {
  "calendar-month": {id: "calendar-month", name: "Monthly calendar", icon: "calendar", minHeight: 280, maxHeight: 300, resizable: false},
  stats: {id: "stats", name: "Statistics", icon: "fire", minHeight: 60, maxHeight: 250, resizable: true},
  activity: {id: "activity", name: "Daily activity", icon: "history", minHeight: 120, maxHeight: 420, resizable: true},
} satisfies Record<WidgetId, WidgetDef>

export const DEFAULT_LAYOUT = [
  {id: "calendar-month", height: WIDGET_DEFS["calendar-month"].maxHeight},
  {id: "stats", height: WIDGET_DEFS["stats"].maxHeight},
  {id: "activity", height: WIDGET_DEFS["activity"].maxHeight},
] satisfies WidgetLayout
