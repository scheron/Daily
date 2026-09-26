// @ts-nocheck

export function makeSessionTask(taskId, overrides = {}) {
  return {taskId, title: `Task ${taskId}`, focusedSeconds: 0, isDone: false, ...overrides}
}
