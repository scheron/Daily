import os from "node:os"
import path from "node:path"
import {nanoid} from "nanoid"
import PouchDB from "pouchdb"
import PouchDBFind from "pouchdb-find"

PouchDB.plugin(PouchDBFind)

/**
 * Get database path based on platform
 */
function getDbPath() {
  const platform = os.platform()
  const home = os.homedir()

  let appDataPath

  if (platform === "darwin") {
    appDataPath = path.join(home, "Library", "Application Support", "Daily")
  } else if (platform === "win32") {
    appDataPath = path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Daily")
  } else {
    appDataPath = path.join(home, ".config", "Daily")
  }

  return path.join(appDataPath, "db")
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
function formatISODate(date) {
  return date.toISOString().split("T")[0]
}

/**
 * Format time to ISO time string (HH:MM:SS)
 */
function formatISOTime(hours, minutes = 0) {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`
}

/**
 * Get timezone
 */
function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Create a date relative to today
 */
function daysFromToday(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

/**
 * Get all dates in the current month
 */
function getAllDatesInMonth() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const dates = []
  for (let day = 1; day <= lastDay.getDate(); day++) {
    dates.push(new Date(year, month, day))
  }

  return dates
}

/**
 * Get random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Get random element from array
 */
function randomElement(array) {
  return array[randomInt(0, array.length - 1)]
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Create ISO datetime
 */
function createISODateTime(date, time = "00:00:00") {
  const [hours, minutes, seconds] = time.split(":")
  const dt = new Date(date)
  dt.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds || 0))
  return dt.toISOString()
}

/**
 * Main function
 */

// Helper functions for text output formatting (no colors)
function bold(str) {
  return `**${str}**`
}
function gray(str) {
  return str
}
function cyan(str) {
  return str
}
function blue(str) {
  return str
}
function green(str) {
  return str
}
function red(str) {
  return str
}
function yellow(str) {
  return str
}

async function main() {
  try {
    const dbPath = getDbPath()

    console.log("\n📦 Filling Daily database for showcase\n")
    console.log(`Database path: ${dbPath}\n`)

    let db
    try {
      db = new PouchDB(dbPath)
    } catch (error) {
      if (error.message && error.message.includes("lock")) {
        console.log("❌ Error: Database is locked!\n")
        console.log("⚠️  Please close the Daily app before running this script.\n")
        process.exit(1)
      }
      throw error
    }

    try {
      await db.createIndex({index: {fields: ["type"]}})
      await db.createIndex({index: {fields: ["type", "scheduled.date"]}})
      await db.createIndex({index: {fields: ["type", "status"]}})
    } catch (error) {
      // Indexes might already exist, that's fine
    }

    const now = new Date()
    const timezone = getTimezone()

    console.log("🏷️  Creating tags...")
    const tags = [
      {name: "Work", color: "#3B82F6", emoji: "💼"},
      {name: "Personal", color: "#10B981", emoji: "🏠"},
      {name: "Urgent", color: "#EF4444", emoji: "🔥"},
      {name: "Project", color: "#8B5CF6", emoji: "📁"},
      {name: "Meeting", color: "#F59E0B", emoji: "📅"},
      {name: "Review", color: "#06B6D4", emoji: "👀"},
    ]

    const existingTags = await db.find({
      selector: {type: "tag"},
    })
    const existingTagNames = new Set(existingTags.docs.map((doc) => doc.name))

    const createdTags = []
    for (const tag of tags) {
      const existingTag = existingTags.docs.find((doc) => doc.name === tag.name)
      if (existingTag) {
        createdTags.push({id: existingTag._id.replace("tag:", ""), ...tag})
        console.log(`  ⊙ ${tag.emoji} ${tag.name} (already exists)`)
        continue
      }

      const tagId = nanoid()
      const createdAt = now.toISOString()
      const tagDoc = {
        _id: `tag:${tagId}`,
        type: "tag",
        name: tag.name,
        color: tag.color,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }

      try {
        await db.put(tagDoc)
        createdTags.push({id: tagId, ...tag})
        console.log(`  ✓ ${tag.emoji} ${tag.name}`)
      } catch (error) {
        console.log(`  ⚠ Error while creating tag ${tag.name}: ${error.message}`)
      }
    }
    console.log()

    const taskTemplates = [
      {
        content: `# Code Review: PR #{{num}}

## Changes to review:
- [ ] Authentication flow updates
- [ ] Error handling improvements
- [ ] Test coverage

**Priority:** High
**Estimated time:** 2 hours

\`\`\`typescript
function authenticate(user: string) {
  // New implementation
}
\`\`\``,
        tags: ["Work", "Review"],
      },
      {
        content: `## Team Standup Meeting

**Agenda:**
1. Yesterday's accomplishments
2. Today's goals
3. Blockers

**Notes:**
- Discussed new feature requirements
- Need to review API design
- [Link to docs](https://example.com/docs)`,
        tags: ["Work", "Meeting"],
      },
      {
        content: `# Update Project Documentation

## Sections to update:
- [x] API endpoints
- [ ] Authentication guide
- [ ] Deployment process

**Key changes:**
- Added new endpoints
- Updated authentication flow
- Fixed typos in examples`,
        tags: ["Work", "Project"],
      },
      {
        content: `## Fix Bug in {{module}} Module

**Issue:** Critical bug causing crashes

**Steps to fix:**
1. Identify root cause
2. Write test case
3. Implement fix
4. Verify solution

\`\`\`javascript
// Bug fix
if (condition) {
  // Fixed logic
}
\`\`\``,
        tags: ["Work", "Urgent"],
      },
      {
        content: `# Design System Updates

## Components to update:
- Button variants
- Form inputs
- Navigation

**Design tokens:**
- Primary color: \`#3B82F6\`
- Spacing: \`16px\`
- Border radius: \`8px\``,
        tags: ["Work", "Project"],
      },
      {
        content: `## Client Presentation Prep

**Key points:**
1. **Project overview** - Show progress
2. **Demo** - Live features
3. **Next steps** - Roadmap

**Resources:**
- [Presentation slides](./slides.pdf)
- [Demo environment](https://demo.example.com)`,
        tags: ["Work", "Meeting", "Urgent"],
      },
      {
        content: `# Update Dependencies

## Packages to update:
- \`vue\`: 3.4.x → 3.5.x
- \`typescript\`: 5.7.x → 5.8.x
- \`vite\`: 6.2.x → 6.3.x

**Testing checklist:**
- [ ] Run test suite
- [ ] Check for breaking changes
- [ ] Update type definitions`,
        tags: ["Work", "Project"],
      },
      {
        content: `## Sprint Planning Meeting

**Sprint goals:**
- Complete authentication module
- Improve performance
- Fix critical bugs

**Team capacity:** 40 hours
**Sprint duration:** 2 weeks`,
        tags: ["Work", "Meeting"],
      },
      {
        content: `# Refactor {{module}} Module

**Current issues:**
- Code duplication
- Poor test coverage
- Complex logic

**Refactoring plan:**
1. Extract common functions
2. Add unit tests
3. Simplify architecture

\`\`\`typescript
// Before
function oldWay() { }

// After
function newWay() { }
\`\`\``,
        tags: ["Work", "Project"],
      },
      {
        content: `## Write Blog Post: {{topic}}

**Outline:**
1. Introduction
2. Main concepts
3. Examples
4. Conclusion

**Key points:**
- Explain core concepts
- Provide code examples
- Include best practices

**Target length:** 1500 words`,
        tags: ["Work", "Project"],
      },
      {
        content: `# Database Migration Planning

## Migration steps:
- [ ] Backup current database
- [ ] Create migration script
- [ ] Test on staging
- [ ] Schedule downtime
- [ ] Execute migration

**Risk level:** High
**Estimated downtime:** 2 hours`,
        tags: ["Work", "Project", "Urgent"],
      },
      {
        content: `## Quarterly Performance Review

**Metrics to review:**
- Code quality: **A+**
- Team velocity: **120%**
- Bug rate: **-30%**

**Achievements:**
- Shipped 5 major features
- Reduced technical debt
- Improved team morale`,
        tags: ["Work", "Review", "Meeting"],
      },
      {
        content: `# API Endpoint Testing

**Endpoints to test:**
\`\`\`
GET /api/users
POST /api/users
PUT /api/users/:id
DELETE /api/users/:id
\`\`\`

**Test cases:**
- [ ] Success scenarios
- [ ] Error handling
- [ ] Authentication
- [ ] Rate limiting`,
        tags: ["Work", "Project"],
      },
      {
        content: `## Deploy to Staging Environment

**Deployment checklist:**
1. Run tests ✅
2. Build production bundle ✅
3. Update environment variables
4. Deploy to staging
5. Smoke tests

**Rollback plan:** Ready`,
        tags: ["Work", "Urgent"],
      },
      {
        content: `# User Research Analysis

## Key findings:
- **Usability:** 8.5/10
- **Performance:** 9/10
- **Satisfaction:** 85%

**Improvements needed:**
- Simplify onboarding
- Add tooltips
- Improve mobile experience`,
        tags: ["Work", "Review"],
      },
      {
        content: `## Security Audit Review

**Areas audited:**
- Authentication ✅
- Authorization ✅
- Data encryption ⚠️
- API security ✅

**Action items:**
- [ ] Fix encryption issues
- [ ] Update dependencies
- [ ] Review access controls`,
        tags: ["Work", "Review", "Urgent"],
      },
      {
        content: `# Performance Optimization

**Bottlenecks identified:**
- Database queries: **-40%** faster
- API response time: **-25%**
- Bundle size: **-15%**

**Optimizations:**
- Added caching layer
- Optimized queries
- Code splitting`,
        tags: ["Work", "Project"],
      },
      {
        content: `## Grocery Shopping List

**Produce:**
- [ ] Apples
- [ ] Bananas
- [ ] Spinach

**Dairy:**
- [ ] Milk
- [ ] Cheese
- [ ] Yogurt

**Other:**
- [ ] Bread
- [ ] Eggs`,
        tags: ["Personal"],
      },
      {
        content: `# Evening Workout Plan

**Warm-up:** 10 min
**Main workout:**
- Cardio: 30 min
- Strength: 20 min
- Cool-down: 10 min

**Goal:** Stay consistent! 💪`,
        tags: ["Personal"],
      },
      {
        content: `## Weekend Hiking Trip Planning

**Location:** Mountain Trail
**Date:** This weekend

**Checklist:**
- [ ] Pack gear
- [ ] Check weather
- [ ] Plan route
- [ ] Prepare snacks

**Distance:** 10km
**Difficulty:** Moderate`,
        tags: ["Personal"],
      },
      {
        content: `# Read: {{book}}

**Progress:** Chapter 5/12

**Key takeaways:**
- Design patterns explained
- Code examples helpful
- Practical applications

**Notes:**
- Review chapter 3 concepts
- Practice exercises`,
        tags: ["Personal"],
      },
      {
        content: `## Meal Prep for the Week

**Meals to prepare:**
1. **Monday-Wednesday:** Chicken & rice
2. **Thursday-Friday:** Pasta & vegetables
3. **Weekend:** Leftovers

**Shopping needed:** ✅ Done
**Prep time:** 2 hours`,
        tags: ["Personal"],
      },
    ]

    const modules = ["authentication", "payment", "user", "notification", "analytics", "reporting"]
    const topics = ["new features", "best practices", "architecture", "performance", "security"]
    const books = ["Clean Code", "Design Patterns", "System Design", "The Pragmatic Programmer"]
    const skills = ["TypeScript", "Vue.js", "Node.js", "Docker", "Kubernetes"]

    console.log("📝 Generating 20 tasks for the month...")

    const monthDates = getAllDatesInMonth()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tasks = []
    const TARGET_TASKS = 20

    for (let i = 0; i < TARGET_TASKS; i++) {
      const date = randomElement(monthDates)
      const isPast = date < today
      const isToday = formatISODate(date) === formatISODate(today)
      const isFuture = date > today

      const template = randomElement(taskTemplates)
      let content = template.content

      content = content.replace(/\{\{num\}\}/g, String(randomInt(100, 999)))
      content = content.replace(/\{\{module\}\}/g, randomElement(modules))
      content = content.replace(/\{\{topic\}\}/g, randomElement(topics))
      content = content.replace(/\{\{book\}\}/g, randomElement(books))
      content = content.replace(/\{\{skill\}\}/g, randomElement(skills))

      let status
      if (isPast) {
        status = randomElement(["done", "done", "done", "done", "discarded"])
      } else if (isToday) {
        status = randomElement(["done", "done", "active", "active", "active"])
      } else {
        status = "active"
      }

      const hour = randomInt(8, 20)
      const minute = randomInt(0, 59)
      const time = formatISOTime(hour, minute)

      const estimatedTime = randomInt(15, 240)

      let spentTime = 0
      if (status === "done") {
        const variance = randomInt(-30, 60)
        spentTime = Math.max(15, estimatedTime + variance)
      } else if (status === "active" && isToday) {
        if (Math.random() > 0.5) {
          spentTime = randomInt(0, Math.floor(estimatedTime * 0.7))
        }
      }

      const numTags = randomInt(1, 3)
      const selectedTags = shuffleArray(template.tags).slice(0, numTags)

      tasks.push({
        content,
        status,
        date,
        time,
        estimatedTime,
        spentTime,
        tags: selectedTags,
      })
    }

    const shuffledTasks = shuffleArray(tasks)

    console.log(`  Generated ${shuffledTasks.length} tasks for ${monthDates.length} days\n`)
    console.log("📝 Creating tasks in database...\n")

    let createdCount = 0
    for (const task of shuffledTasks) {
      const taskId = nanoid()
      const taskDate = formatISODate(task.date)
      const createdAt = createISODateTime(task.date, task.time)
      const updatedAt = task.status === "done" ? createISODateTime(task.date, task.time) : now.toISOString()

      const tagIds = task.tags
        .map((tagName) => {
          const tag = createdTags.find((t) => t.name === tagName)
          return tag ? tag.id : null
        })
        .filter(Boolean)

      const taskDoc = {
        _id: `task:${taskId}`,
        type: "task",
        status: task.status,
        scheduled: {
          date: taskDate,
          time: task.time,
          timezone: timezone,
        },
        estimatedTime: task.estimatedTime,
        spentTime: task.spentTime,
        content: task.content,
        tags: tagIds,
        attachments: [],
        createdAt,
        updatedAt,
        deletedAt: null,
      }

      try {
        await db.put(taskDoc)
        createdCount++

        if (createdCount % 10 === 0 || createdCount === shuffledTasks.length) {
          const statusEmoji = task.status === "done" ? "✅" : task.status === "discarded" ? "❌" : "⏳"
          const progress = Math.round((createdCount / shuffledTasks.length) * 100)
          console.log(
            `  ${statusEmoji} [${createdCount}/${shuffledTasks.length}] ${progress}% - ${task.content.substring(0, 40)}${task.content.length > 40 ? "..." : ""}`,
          )
        }
      } catch (error) {
        if (error.status === 409) {
          // Skip duplicates silently
        } else {
          console.log(`  ✗ Error while creating task: ${task.content.substring(0, 30)}... - ${error.message}`)
        }
      }
    }

    console.log()
    console.log(`✅ Tasks created: ${createdCount} out of ${shuffledTasks.length}`)
    console.log()

    const allDocs = await db.allDocs({include_docs: false})
    const taskDocs = await db.find({
      selector: {type: "task"},
    })
    const tagDocs = await db.find({
      selector: {type: "tag"},
    })

    console.log("📊 Database statistics:\n")
    console.log(`  Tasks: ${taskDocs.docs.length}`)
    console.log(`  Tags: ${tagDocs.docs.length}`)
    console.log(`  Total documents: ${allDocs.total_rows}\n`)

    await db.close()

    console.log("✨ Database successfully populated!\n")
  } catch (error) {
    if (error.message && error.message.includes("lock")) {
      console.log("\n❌ Error: Database is locked!\n")
      console.log("⚠️  Please close the Daily app before running this script.\n")
    } else {
      console.error("❌ Error:", error)
    }
    process.exit(1)
  }
}

main()
