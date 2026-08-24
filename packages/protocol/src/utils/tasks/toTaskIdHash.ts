export function toTaskIdHash(taskId: string): string {
  return taskId.slice(-6)
}
