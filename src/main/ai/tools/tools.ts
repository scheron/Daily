/**
 * AI Tools Definition
 *
 * Defines tools available to the AI assistant for managing tasks and tags.
 * Each tool has detailed descriptions to help the LLM understand when and how to use them.
 */

import type {Tool} from "../types"

export const AI_TOOLS: Tool[] = [
  // ========== TASKS ==========
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "Get tasks for a specific date. Use this to see what tasks exist before making changes. " +
        "Returns task list with IDs (needed for other operations), content, status (active/done/discarded), scheduled time, and tags. " +
        "Example: User asks 'what do I have today?' or 'show my tasks for tomorrow'.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format. Defaults to today. Example: '2024-03-15'",
          },
          include_done: {
            type: "boolean",
            description: "Include completed tasks in results. Defaults to true.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_task",
      description:
        "Get detailed information about a single task by its ID. " +
        "Use when you need full task details or to verify a task exists before modifying it.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "The unique task ID (alphanumeric string like 'kWGw48U_VtUiyIIp_wkEV'). Get IDs from list_tasks or search_tasks.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a new task. Use when user wants to add a new task, todo, reminder, or appointment. " +
        "Parse natural language to extract date/time if mentioned. " +
        "Example: 'add task buy milk' -> content='buy milk', date=today. " +
        "'remind me to call mom tomorrow at 3pm' -> content='call mom', date=tomorrow, time='15:00'. " +
        "To add tags, first use list_tags to get available tag_ids.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Task description/content. Keep it concise but descriptive.",
          },
          date: {
            type: "string",
            description: "Scheduled date in YYYY-MM-DD format. Defaults to today if user doesn't specify.",
          },
          time: {
            type: "string",
            description: "Scheduled time in HH:MM 24-hour format. Example: '14:30' for 2:30 PM. Optional.",
          },
          tag_ids: {
            type: "array",
            description: "Array of tag IDs to assign. Get available IDs from list_tags first.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Update an existing task's content, date, time, or status. " +
        "Use for editing task text, rescheduling, or changing status. " +
        "First use list_tasks to find the task_id. " +
        "For simple status changes, prefer complete_task, discard_task, or reactivate_task instead.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to update. Get from list_tasks or search_tasks.",
          },
          content: {
            type: "string",
            description: "New task content/description.",
          },
          date: {
            type: "string",
            description: "New scheduled date (YYYY-MM-DD). Use move_task for just changing date.",
          },
          time: {
            type: "string",
            description: "New scheduled time (HH:MM 24h format).",
          },
          status: {
            type: "string",
            description: "New status: 'active' (in progress), 'done' (completed), 'discarded' (cancelled).",
            enum: ["active", "done", "discarded"],
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Mark a task as completed/done. Use when user says 'done', 'finished', 'completed', 'check off'. " +
        "Example: 'mark buy milk as done' or 'I finished the report'.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to mark as completed. Get from list_tasks first.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "discard_task",
      description:
        "Mark a task as discarded/cancelled (not done, but no longer needed). " +
        "Use when user says 'cancel', 'skip', 'won't do', 'not needed anymore'. " +
        "Different from delete_task - discarded tasks stay visible but marked as cancelled.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to discard. Get from list_tasks first.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reactivate_task",
      description:
        "Reactivate a completed or discarded task back to active status. " +
        "Use when user wants to 'undo' completion or 'uncancel' a task. " +
        "Example: 'actually I didn't finish that task' or 'reopen the report task'.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to reactivate.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description:
        "Move a task to trash (soft delete). Task can be restored later with restore_task. " +
        "Use when user says 'delete', 'remove', 'trash'. " +
        "For permanent deletion, use permanently_delete_task.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to move to trash.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deleted_tasks",
      description: "List tasks in trash that can be restored. " + "Use when user asks about deleted tasks or wants to restore something.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum tasks to return. Defaults to 20.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "restore_task",
      description: "Restore a deleted task from trash back to active tasks. " + "Use get_deleted_tasks first to find the task_id.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to restore from trash.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "permanently_delete_task",
      description:
        "PERMANENTLY delete a task - cannot be undone! " +
        "Only use when user explicitly confirms permanent deletion. " +
        "Ask for confirmation before using this.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to permanently delete.",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task_tags",
      description:
        "Add tags to a task for categorization. " +
        "First use list_tags to see available tags and get their IDs. " +
        "If needed tag doesn't exist, use create_tag first. " +
        "Example: 'add work tag to the meeting task'.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to add tags to.",
          },
          tag_ids: {
            type: "array",
            description: "Array of tag IDs to add. Get IDs from list_tags.",
          },
        },
        required: ["task_id", "tag_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_task_tags",
      description: "Remove tags from a task. " + "Use list_tasks or get_task first to see which tags the task currently has.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to remove tags from.",
          },
          tag_ids: {
            type: "array",
            description: "Array of tag IDs to remove.",
          },
        },
        required: ["task_id", "tag_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tasks",
      description:
        "Search all tasks by content text. Returns matching tasks across all dates. " +
        "Use when user wants to find a task but doesn't know the exact date. " +
        "Example: 'find all tasks about meeting' or 'search for project tasks'.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search text to find in task content.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_task",
      description:
        "Move/reschedule a task to a different date. " +
        "Use when user says 'move to', 'reschedule', 'postpone', 'push to tomorrow'. " +
        "Example: 'move the dentist task to next Monday'.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to move.",
          },
          date: {
            type: "string",
            description: "New date in YYYY-MM-DD format.",
          },
        },
        required: ["task_id", "date"],
      },
    },
  },

  // ========== TAGS ==========
  {
    type: "function",
    function: {
      name: "list_tags",
      description:
        "Get all available tags with their IDs, names, and colors. " +
        "ALWAYS call this first before add_task_tags or create_task with tags to get valid tag_ids. " +
        "Example: User asks 'what tags do I have?' or before assigning tags to a task.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tag",
      description: "Get detailed information about a single tag by its ID.",
      parameters: {
        type: "object",
        properties: {
          tag_id: {
            type: "string",
            description: "Tag ID to look up.",
          },
        },
        required: ["tag_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_tag",
      description:
        "Create a new tag for categorizing tasks. " +
        "Use when user wants a new category/label. " +
        "Example: 'create a tag for work tasks' or 'add a new personal tag'.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Tag name. Keep it short (1-2 words). Example: 'Work', 'Personal', 'Urgent'.",
          },
          color: {
            type: "string",
            description: "Hex color code. Example: '#FF5733' for orange-red. If not specified, a random color is assigned.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_tag",
      description: "Update an existing tag's name or color. " + "Changes apply to all tasks that have this tag.",
      parameters: {
        type: "object",
        properties: {
          tag_id: {
            type: "string",
            description: "Tag ID to update. Get from list_tags.",
          },
          name: {
            type: "string",
            description: "New tag name.",
          },
          color: {
            type: "string",
            description: "New hex color code.",
          },
        },
        required: ["tag_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_tag",
      description:
        "Delete a tag completely. Automatically removes this tag from all tasks that have it. " +
        "Ask for confirmation as this affects all tasks with this tag.",
      parameters: {
        type: "object",
        properties: {
          tag_id: {
            type: "string",
            description: "Tag ID to delete. Get from list_tags.",
          },
        },
        required: ["tag_id"],
      },
    },
  },
]

export type ToolName =
  // Tasks
  | "list_tasks"
  | "get_task"
  | "create_task"
  | "update_task"
  | "complete_task"
  | "discard_task"
  | "reactivate_task"
  | "delete_task"
  | "get_deleted_tasks"
  | "restore_task"
  | "permanently_delete_task"
  | "add_task_tags"
  | "remove_task_tags"
  | "search_tasks"
  | "move_task"
  // Tags
  | "list_tags"
  | "get_tag"
  | "create_tag"
  | "update_tag"
  | "delete_tag"
