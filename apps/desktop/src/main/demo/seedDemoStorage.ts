import assert from "node:assert/strict"
import {DateTime} from "luxon"

import {NO_PROJECT_ID} from "@daily/protocol"

import type {StorageController} from "@daily/core"
import type {Branch, ISODate, Milestone, Tag, Task, TaskPriority, TaskStatus} from "@daily/protocol"

export const DEMO_TASK_IDS = {
  onboarding: "task:demo-onboarding",
  keyboard: "task:demo-keyboard",
  release: "task:demo-release",
  agentReview: "task:demo-agent-review",
}

type DemoTask = {
  key: string
  title: string
  description: string
  status: TaskStatus
  tags: string[]
  estimate: number
  spent?: number
  priority?: TaskPriority
  milestone?: Milestone["id"] | null
  offset?: number
}

/** Seeds only an empty profile with fictional English work. Existing projects or work are never changed. */
export async function seedDemoStorage(storage: StorageController, today: ISODate = DateTime.local().toISODate()!): Promise<void> {
  const day = DateTime.fromISO(today).startOf("day")
  assert(day.isValid, "The demo date must be a valid ISO date")

  const [tasks, projects, tags, milestones] = await Promise.all([
    storage.getAllTasks(),
    storage.getBranchList(),
    storage.getTagList(),
    storage.getMilestoneList(),
  ])
  if (tasks.length || projects.some((project) => project.id !== NO_PROJECT_ID) || tags.length || milestones.length) return

  let activeProject: Branch | null = null

  await storage.workStorage.batch(async () => {
    const orbit = await storage.createBranch({
      name: "Orbit",
      description:
        "# Orbit\n\nA fictional product studio building a calmer place for independent teams to plan their work.\n\n## This week\n\nMake the first five minutes feel effortless: a welcoming onboarding flow, thoughtful keyboard shortcuts, and a clear launch story.\n\nAll content in this project is synthetic demo data.",
    })
    const fieldNotes = await storage.createBranch({
      name: "Field Notes",
      description:
        "# Field Notes\n\nA fictional collection of design research, writing, and small experiments.\n\nCapture useful observations and turn them into the next clear step.",
    })
    const personal = await storage.createBranch({
      name: "Personal",
      description: "# Personal\n\nA fictional space for a little learning, weekend plans, and life outside the studio.",
    })
    assert(orbit && fieldNotes && personal)
    activeProject = orbit

    const orbitTags = await createTags(storage, orbit.id, [
      ["Design", "#8b5cf6"],
      ["Engineering", "#3b82f6"],
      ["Research", "#f59e0b"],
      ["Launch", "#10b981"],
      ["Writing", "#ec4899"],
    ])
    const notesTags = await createTags(storage, fieldNotes.id, [
      ["Research", "#f59e0b"],
      ["Writing", "#ec4899"],
    ])
    const personalTags = await createTags(storage, personal.id, [
      ["Learning", "#8b5cf6"],
      ["Weekend", "#10b981"],
    ])

    const launch = await createMilestone(
      storage,
      orbit.id,
      "First public release",
      dateAt(day, 6),
      "Bring the essentials together for a thoughtful first impression: onboarding, accessibility, and a small, clear launch.",
    )
    const foundations = await createMilestone(
      storage,
      orbit.id,
      "Product foundations",
      dateAt(day, -7),
      "A focused set of foundations for the next chapter: research, core interactions, and the first design system.",
    )
    const nextChapter = await createMilestone(
      storage,
      orbit.id,
      "Next chapter",
      null,
      "Ideas to revisit after the first release. Intentionally open, with no target date yet.",
    )

    const todayTasks: DemoTask[] = [
      {
        key: "mobile",
        title: "Explore a lighter mobile companion",
        description:
          "Sketch a focused capture experience for the moments between desk sessions.\n\nStart with one useful action: save a thought before it disappears.",
        status: "backlog",
        tags: ["Design", "Research"],
        estimate: 90,
        priority: "low",
        milestone: nextChapter.id,
      },
      {
        key: "templates",
        title: "Collect ideas for project templates",
        description: "Gather three simple starting points: a product launch, a writing project, and a personal learning plan.",
        status: "backlog",
        tags: ["Research"],
        estimate: 45,
        milestone: nextChapter.id,
      },
      {
        key: "empty-states",
        title: "Polish the empty states",
        description:
          "Give each empty screen a helpful next step. Keep the copy warm, specific, and brief.\n\nInclude the first project, search results, and a clear day.",
        status: "todo",
        tags: ["Design", "Writing"],
        estimate: 45,
        priority: "medium",
        milestone: launch.id,
      },
      {
        key: "release",
        title: "Write the launch story",
        description:
          "Tell the story in three parts: the problem, the small details that help, and what comes next.\n\n## Draft outline\n\n- Plan a day without losing the bigger picture.\n- Keep decisions, links, and notes beside the work.\n- Make room for focused progress.\n\nEnd with a short invitation to try the first release.",
        status: "todo",
        tags: ["Launch", "Writing"],
        estimate: 60,
        priority: "high",
        milestone: launch.id,
      },
      {
        key: "research-review",
        title: "Review the usability notes",
        description:
          "Turn the latest fictional research session into a short list of decisions.\n\nFocus on navigation labels and the first project setup.",
        status: "todo",
        tags: ["Research"],
        estimate: 30,
        milestone: launch.id,
      },
      {
        key: "onboarding",
        title: "Refine the onboarding experience",
        description:
          "Help a new team reach its first useful moment without a long setup.\n\n## The first five minutes\n\nCreate a project, add one meaningful task, and choose a day to work on it. Keep everything else out of the way until it is useful.\n\n> A good first run should feel like progress.\n\n## Interaction notes\n\n- Use a single clear action on each step.\n- Save progress locally as the person types.\n- Let the welcome guide be dismissed and reopened.\n\n## Success criteria\n\n| Moment | Expected outcome |\n| --- | --- |\n| First project | A clear name and a little context |\n| First task | One concrete next step |\n| First day | A small, achievable plan |\n\n## Implementation\n\n```ts\nconst firstStep = {\n  title: 'Make space for your next idea',\n  action: 'Create a project',\n  optional: true,\n}\n```\n\nKeep the flow accessible with a keyboard and respect the saved appearance.",
        status: "in_progress",
        tags: ["Design", "Engineering"],
        estimate: 120,
        spent: 75,
        priority: "high",
        milestone: launch.id,
      },
      {
        key: "calendar",
        title: "Tune the calendar interactions",
        description: "Make rescheduling feel predictable.\n\nCheck drag feedback, selected-day contrast, and moving a task to the following week.",
        status: "in_progress",
        tags: ["Engineering"],
        estimate: 75,
        spent: 35,
        priority: "medium",
        milestone: launch.id,
      },
      {
        key: "keyboard",
        title: "Add keyboard navigation to project search",
        description:
          "Support arrow keys, Enter, and Escape consistently.\n\n## Acceptance criteria\n\n- The active result remains visible.\n- Enter opens the selected project.\n- Escape returns focus to the trigger.\n- The empty result state is announced.",
        status: "ready_for_agent",
        tags: ["Engineering"],
        estimate: 60,
        priority: "high",
        milestone: launch.id,
      },
      {
        key: "contrast",
        title: "Check contrast across both appearances",
        description: "Review text, focus rings, and interactive states in light and dark appearance. Record the results beside each component.",
        status: "ready_for_agent",
        tags: ["Design", "Engineering"],
        estimate: 45,
        priority: "medium",
        milestone: launch.id,
      },
      {
        key: "shortcuts",
        title: "Review the shortcuts panel",
        description: "The layout and key labels are ready for a final review. Check long labels and the compact window size before merging.",
        status: "ready_to_merge",
        tags: ["Engineering"],
        estimate: 45,
        spent: 40,
        milestone: launch.id,
      },
      {
        key: "agent-review",
        title: "Review agent implementation",
        description:
          "Review the keyboard navigation update before merging. The fictional agent notes below keep the implementation, checks, and review decision beside the task.",
        status: "ready_to_merge",
        tags: ["Engineering"],
        estimate: 75,
        spent: 55,
        priority: "high",
        milestone: launch.id,
      },
      {
        key: "icons",
        title: "Simplify the navigation icons",
        description: "A quieter set of icons with consistent stroke weight and clearer selected states.",
        status: "done",
        tags: ["Design"],
        estimate: 45,
        spent: 35,
        milestone: launch.id,
      },
      {
        key: "copy",
        title: "Tighten the welcome copy",
        description: "Shorter labels, one useful next step, and no unnecessary setup questions.",
        status: "done",
        tags: ["Writing"],
        estimate: 30,
        spent: 25,
        milestone: launch.id,
      },
      {
        key: "test-plan",
        title: "Prepare the release checklist",
        description: "A practical review of install, first run, keyboard navigation, and the daily planning flow.",
        status: "done",
        tags: ["Launch"],
        estimate: 30,
        spent: 30,
        milestone: launch.id,
      },
      {
        key: "tour",
        title: "Add an automatic product tour",
        description: "Replaced with a short, optional welcome guide. The first run should leave more room for doing the work.",
        status: "cancelled",
        tags: ["Design"],
        estimate: 60,
        milestone: launch.id,
      },
    ]

    for (const task of todayTasks) await createTask(storage, orbit.id, orbitTags, task, day)

    const history = [
      ["Map the first-run journey", "Research"],
      ["Define the core navigation", "Design"],
      ["Build the project switcher", "Engineering"],
      ["Draft the product principles", "Writing"],
      ["Review the task card hierarchy", "Design"],
      ["Improve the Markdown preview", "Engineering"],
      ["Capture research observations", "Research"],
      ["Document the interaction patterns", "Writing"],
      ["Test the rescheduling flow", "Engineering"],
      ["Organize the component library", "Design"],
      ["Write the accessibility checklist", "Writing"],
      ["Review the focus states", "Design"],
    ]
    for (let offset = -25; offset < 0; offset++) {
      if (day.plus({days: offset}).weekday > 5) continue
      const count = 2 + (Math.abs(offset) % 3)
      for (let index = 0; index < count; index++) {
        const [title, tag] = history[(Math.abs(offset) * 3 + index) % history.length]!
        await createTask(
          storage,
          orbit.id,
          orbitTags,
          {
            key: `history-${Math.abs(offset)}-${index}`,
            title: title!,
            description:
              "A completed step from the fictional Orbit project.\n\nThe decision and follow-up notes are kept with the work for future reference.",
            status: "done",
            tags: [tag!],
            estimate: 30 + index * 15,
            spent: 25 + index * 20 + (Math.abs(offset) % 10),
            milestone: foundations.id,
            offset,
          },
          day,
        )
      }
    }

    for (const task of [
      {
        key: "tomorrow-prototype",
        title: "Walk through the first-run prototype",
        description: "Review the updated flow from a new team's point of view.",
        status: "todo",
        tags: ["Design"],
        estimate: 45,
        offset: 1,
        milestone: launch.id,
      },
      {
        key: "tomorrow-install",
        title: "Run a fresh install check",
        description: "Start with a clean profile and follow the release checklist.",
        status: "todo",
        tags: ["Engineering", "Launch"],
        estimate: 30,
        offset: 1,
        milestone: launch.id,
      },
      {
        key: "next-week",
        title: "Plan the next research round",
        description: "Write five focused questions for the next fictional usability study.",
        status: "todo",
        tags: ["Research"],
        estimate: 45,
        offset: 3,
        milestone: nextChapter.id,
      },
    ] satisfies DemoTask[])
      await createTask(storage, orbit.id, orbitTags, task, day)

    await createTask(
      storage,
      fieldNotes.id,
      notesTags,
      {
        key: "essay",
        title: "Draft an essay on calm software",
        description:
          "Explore how clear defaults, visible progress, and thoughtful constraints help people keep their attention.\n\nStart with three small examples from everyday tools.",
        status: "in_progress",
        tags: ["Writing"],
        estimate: 90,
        spent: 40,
        priority: "medium",
      },
      day,
    )
    await createTask(
      storage,
      fieldNotes.id,
      notesTags,
      {
        key: "reading",
        title: "Collect notes on useful constraints",
        description: "Look for product decisions that make the next action easier to see.",
        status: "todo",
        tags: ["Research"],
        estimate: 30,
      },
      day,
    )
    await createTask(
      storage,
      fieldNotes.id,
      notesTags,
      {
        key: "interviews",
        title: "Create a research interview template",
        description: "A reusable outline for goals, observations, decisions, and follow-up questions.",
        status: "backlog",
        tags: ["Research", "Writing"],
        estimate: 45,
      },
      day,
    )
    await createTask(
      storage,
      personal.id,
      personalTags,
      {
        key: "walk",
        title: "Take a long walk by the river",
        description: "An unhurried afternoon outside. Bring a notebook and leave room for a detour.",
        status: "todo",
        tags: ["Weekend"],
        estimate: 60,
        priority: "low",
      },
      day,
    )
    await createTask(
      storage,
      personal.id,
      personalTags,
      {
        key: "learn",
        title: "Practice a little creative coding",
        description: "Make one small generative sketch using circles, a grid, and a limited palette.",
        status: "done",
        tags: ["Learning"],
        estimate: 45,
        spent: 40,
      },
      day,
    )

    for (const [content, done] of [
      ["Map the first useful moment", true],
      ["Simplify the project setup step", true],
      ["Review keyboard and screen reader behavior", false],
      ["Check the flow in both appearances", false],
    ] as const) {
      const created = await storage.createSubtask(DEMO_TASK_IDS.onboarding, content)
      const subtask = created.subtasks?.upserted?.[0]
      assert(subtask)
      if (done) await storage.updateSubtask(subtask.id, {done: true})
    }
    for (const content of ["Keep the active result visible", "Return focus when the menu closes", "Cover empty results and long project names"]) {
      await storage.createSubtask(DEMO_TASK_IDS.keyboard, content)
    }
    await storage.createTaskComment(
      DEMO_TASK_IDS.onboarding,
      "**Demo implementation note**\n\nThe shorter flow keeps the welcome guide optional with `optional: true`. The first project can do the explaining.\n\n- [x] Save the draft locally\n- [x] Keep one primary action per step",
      {kind: "mcp", provider: "Codex"},
    )
    await storage.createTaskComment(
      DEMO_TASK_IDS.onboarding,
      "**Demo review note**\n\nThe primary action stays in the same place on every step. The keyboard pass is the final open item. See the [review checklist](https://example.com/orbit/review).",
      {kind: "mcp", provider: "Claude Code"},
    )
    await storage.createTaskComment(
      DEMO_TASK_IDS.agentReview,
      "**Demo implementation note**\n\nKeyboard selection now stays in view.\n\n```ts\nconst next = results.at(activeIndex)\nnext?.scrollIntoView({ block: 'nearest' })\n```\n\n- [x] Arrow keys select a result\n- [x] Escape returns focus\n\nChanges are ready for [review](https://example.com/orbit/review).",
      {kind: "mcp", provider: "Codex"},
    )
    await storage.createTaskComment(
      DEMO_TASK_IDS.agentReview,
      "**Demo review note**\n\nThe focus path is clear and the empty state is covered.\n\n- [x] Keyboard behavior reviewed\n- [x] Long project names checked\n- [ ] Final merge approval\n\nKeep `aria-activedescendant` aligned with the selected result.",
      {kind: "mcp", provider: "Claude Code"},
    )
    await storage.createTaskComment(
      DEMO_TASK_IDS.release,
      "Lead with the everyday planning flow. A concrete example will explain more than a long feature list.",
    )
    await storage.setTaskRelations(DEMO_TASK_IDS.release, {blockedBy: [DEMO_TASK_IDS.onboarding], blocks: []})
    await storage.updateTask(DEMO_TASK_IDS.onboarding, {priority: "medium"})
    await storage.updateTask(DEMO_TASK_IDS.onboarding, {priority: "high"})
  })

  assert(activeProject)
  const settings = await storage.loadSettings()
  await storage.saveSettings({
    appearance: {...settings.appearance, mode: "light", base: "neutral", accent: "indigo", boardMode: "normal", taskView: "regular"},
    typography: {fontSize: "normal"},
    branch: {activeId: (activeProject as Branch).id, isAllProjects: false},
    quickTask: {...settings.quickTask, isEnabled: false},
    menuBar: {isVisible: false},
    focus: {shouldNotify: false, shouldPlaySound: false},
    ai: null,
    window: {main: {width: 1440, height: 960, isMaximized: false, isFullScreen: false}},
  })
}

async function createTags(storage: StorageController, branchId: Branch["id"], values: string[][]): Promise<Map<string, Tag>> {
  const tags = new Map<string, Tag>()
  for (const [name, color] of values) {
    const tag = await storage.createTag({name: name!, color: color!, branchId, deletedAt: null})
    assert(tag)
    tags.set(tag.name, tag)
  }
  return tags
}

async function createMilestone(
  storage: StorageController,
  branchId: Branch["id"],
  name: string,
  targetDate: ISODate | null,
  description: string,
): Promise<Milestone> {
  const created = await storage.createMilestone({branchId, name, targetDate, description, deletedAt: null})
  const milestone = created.milestones?.upserted?.[0]
  assert(milestone)
  return milestone
}

async function createTask(storage: StorageController, branchId: Branch["id"], tags: Map<string, Tag>, task: DemoTask, day: DateTime): Promise<void> {
  const now = new Date().toISOString()
  const input: Task = {
    id: `task:demo-${task.key}`,
    branchId,
    content: `# ${task.title}\n\n${task.description}`,
    status: task.status,
    tags: task.tags.map((name) => tags.get(name)!),
    priority: task.priority ?? "none",
    minimized: task.key !== "onboarding",
    scheduled: task.status === "backlog" ? null : {date: dateAt(day, task.offset ?? 0), time: "", timezone: day.zoneName ?? "UTC"},
    estimatedTime: task.estimate * 60,
    spentTime: (task.spent ?? 0) * 60,
    milestoneId: task.milestone ?? null,
    orderIndex: 1024 * (1 + (await storage.getAllTasks()).length),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await storage.createTask(input)
}

function dateAt(day: DateTime, offset: number): ISODate {
  return day.plus({days: offset}).toISODate()!
}
