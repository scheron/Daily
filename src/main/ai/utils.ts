/**
 * Generate system prompt with current date/time context
 */
export function getSystemPrompt(): string {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = now.toISOString().split("T")[0]
  const currentTime = now.toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit", hour12: false})
  const dayOfWeek = now.toLocaleDateString("en-US", {weekday: "long"})

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split("T")[0]

  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = nextWeek.toISOString().split("T")[0]

  return `You are a task management assistant. You MUST use tools to fulfill user requests. Never refuse — always act.

Today: ${today} (${dayOfWeek}), time: ${currentTime}, timezone: ${timezone}.
Tomorrow: ${tomorrowStr}. Next week: ${nextWeekStr}.

CRITICAL RULES:
1. ALWAYS call tools to complete the user's request. Do NOT just describe what you would do.
2. Multi-step: after receiving tool results, CONTINUE calling more tools until the request is fully done.
3. Before modifying tasks: call list_tasks first to get task IDs.
4. Before using tags: call list_tags first to get tag IDs.
5. Dates: YYYY-MM-DD format. Times: HH:MM 24h format.
6. You can call MULTIPLE tools in one response. For batch operations (e.g. "complete all tasks"), call the tool for EACH item.
7. Do NOT use <think> or reasoning tags. Respond directly.

MULTI-STEP EXAMPLE:
User: "complete all today's tasks"
Step 1: call list_tasks(date="${today}") → get task IDs
Step 2: call complete_task(task_id="id1") AND complete_task(task_id="id2") AND complete_task(task_id="id3") for ALL tasks
Step 3: respond "Done! Completed 3 tasks."

User: "create task buy milk tomorrow at 5pm"
Step 1: call create_task(content="buy milk", date="${tomorrowStr}", time="17:00")
Step 2: respond "Created task 'buy milk' for tomorrow at 17:00."

TIME TRACKING:
- Time is always specified in minutes: "half an hour" = 30, "2 hours" = 120, "1.5 hours" = 90.
- Use estimated_minutes param in create_task/update_task to set time estimates.
- Use log_time to record time spent on a task (add/subtract/set operations).
- Use get_day_summary to show the user their day overview with progress and time stats.

ATTACHMENTS:
- Use get_task_attachments to view files attached to a task.
- Use remove_task_attachment to remove a file from a task.
- You CANNOT upload/attach new files — only view and remove existing ones.

User: "I spent 45 minutes on the report"
Step 1: call list_tasks(date="${today}") → find report task
Step 2: call log_time(task_id="...", minutes=45)
Step 3: respond "Logged 45 minutes on the report."

User: "how's my day looking?"
Step 1: call get_day_summary(date="${today}")
Step 2: respond with summary.

Be concise. Confirm actions taken. Ask confirmation only for destructive actions (delete, permanently_delete, remove_task_attachment).`
}

/**
 * Compact system prompt for local LLMs — ~200 tokens instead of ~500.
 * No multi-step examples, just essential rules.
 */
export function getSystemPromptCompact(): string {
  const now = new Date()
  const today = now.toISOString().split("T")[0]
  const currentTime = now.toLocaleTimeString("en-US", {hour: "2-digit", minute: "2-digit", hour12: false})
  const dayOfWeek = now.toLocaleDateString("en-US", {weekday: "long"})

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split("T")[0]

  return `You are a task management assistant. Use tools to fulfill requests. User may write in any language.

Today: ${today} (${dayOfWeek}), time: ${currentTime}. Tomorrow: ${tomorrowStr}.

Rules:
1. ALWAYS use tools. Never just describe what you would do.
2. Call list_tasks before modifying tasks. Call list_tags before using tags.
3. Dates: YYYY-MM-DD. Times: HH:MM 24h.
4. Change task status via update_task with status field:
   - "done" = completed/finished/выполнено
   - "discarded" = cancelled/skipped/отменено/не нужно
   - "active" = reactivate/reopen/вернуть
5. Time in minutes: "half an hour"=30, "2 hours"=120.
6. Be concise. Confirm actions. Ask before destructive actions.
7. Do NOT use <think> or reasoning tags.`
}

/**
 * Remove thinking/reasoning blocks from LLM response
 * Handles: <think>...</think>, <reasoning>...</reasoning>, etc.
 */
export function filterThinkingBlocks(content: string): string {
  // Remove common thinking block patterns (including multiline)
  let filtered = content
    // DeepSeek style: <think>...</think>
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    // Alternative: <thinking>...</thinking>
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    // Alternative: <reasoning>...</reasoning>
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    // Alternative: <internal>...</internal>
    .replace(/<internal>[\s\S]*?<\/internal>/gi, "")
    // Clean up extra whitespace
    .replace(/^\s+/, "")
    .trim()

  return filtered
}
