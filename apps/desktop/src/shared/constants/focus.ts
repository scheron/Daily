import type {FocusMode} from "@shared/types/focus"

export const FOCUS_DURATIONS: Record<FocusMode, {focusSeconds: number; breakSeconds: number} | null> = {
  "pomodoro-25": {focusSeconds: 25 * 60, breakSeconds: 5 * 60},
  "pomodoro-50": {focusSeconds: 50 * 60, breakSeconds: 10 * 60},
  timer: null,
}
