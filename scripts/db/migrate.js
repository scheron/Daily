/**
 * Legacy Data Migration Script
 *
 * Migrates data from old file-based storage to PouchDB:
 * - <legacy-path> → ~/Library/Application Support/Daily/db/
 *
 * Source structure:
 * - <legacy-path>/.meta.json (tasks metadata)
 * - <legacy-path>/.config.json (settings)
 * - <legacy-path>/YYYY-MM-DD/*.md (task files)
 * - <legacy-path>/assets/* (asset files)
 *
 * Target structure:
 * - PouchDB with TaskDoc, TagDoc, SettingsDoc, FileDoc
 *
 * Usage:
 *   node scripts/migrate.js <legacy-path>
 *
 * Example:
 *   node scripts/migrate.js "/Users/username/Library/Mobile Documents/com~apple~CloudDocs/Daily"
 *   node scripts/migrate.js "/Users/username/Documents/Daily"
 */

import {createHash} from 'node:crypto'
import fs from 'fs-extra'
import matter from 'gray-matter'
import {nanoid} from 'nanoid'
import os from 'node:os'
import path from 'node:path'
import PouchDB from 'pouchdb'
import PouchDBFind from 'pouchdb-find'

// Extract fs-extra methods
const {readdir, readFile, pathExists} = fs

// Register PouchDB plugins
PouchDB.plugin(PouchDBFind)

/* ============================================ */
/* ============== CONFIGURATION ============== */
/* ============================================ */

// Get legacy path from command line argument
const LEGACY_ROOT_ARG = process.argv[2]

if (!LEGACY_ROOT_ARG) {
  console.error('❌ Error: Legacy data path is required')
  console.error()
  console.error('Usage: node scripts/migrate.js <legacy-path>')
  console.error()
  console.error('Example:')
  console.error('  node scripts/migrate.js "/Users/username/Library/Mobile Documents/com~apple~CloudDocs/Daily"')
  console.error('  node scripts/migrate.js "/Users/username/Documents/Daily"')
  console.error()
  process.exit(1)
}

const LEGACY_ROOT = path.resolve(LEGACY_ROOT_ARG)
const NEW_DB_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'Daily', 'db')

const LEGACY_META_FILE = path.join(LEGACY_ROOT, '.meta.json')
const LEGACY_CONFIG_FILE = path.join(LEGACY_ROOT, '.config.json')
const LEGACY_ASSETS_DIR = path.join(LEGACY_ROOT, 'assets')

console.log('📂 Migration paths:')
console.log('   From:', LEGACY_ROOT)
console.log('   To:  ', NEW_DB_PATH)
console.log()

/* ============================================ */
/* ================ UTILITIES ================ */
/* ============================================ */

/**
 * Get MIME type from file extension
 */
function getMimeType(extension) {
  const mimeTypes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
  }

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
}

/**
 * Parse duration string (e.g., "2 h. 30 min.") to seconds
 * (matching the format used in the application)
 */
function parseDuration(str) {
  if (!str || str === '-') return 0

  let total = 0
  const hourMatch = str.match(/(\d+)\s*h/)
  const minMatch = str.match(/(\d+)\s*min/)

  if (hourMatch) total += parseInt(hourMatch[1]) * 60 * 60
  if (minMatch) total += parseInt(minMatch[1]) * 60

  return total
}

/**
 * Normalize date to YYYY-MM-DD format
 * Handles dates with time, timestamps, etc.
 */
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return ''

  // Extract YYYY-MM-DD from various formats
  // Handles: "2025-11-29", "2025-11-29T03:11:19", "2025-11-29 03:11:19", etc.
  const dateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dateMatch) {
    return dateMatch[1]
  }

  // Try to parse as Date and format
  try {
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch (e) {
    // Ignore parsing errors
  }

  return ''
}

/* ============================================ */
/* ============ DATABASE OPERATIONS ========== */
/* ============================================ */

/**
 * Initialize PouchDB connection
 */
async function initDB() {
  console.log('🔌 Connecting to PouchDB...')

  const db = new PouchDB(NEW_DB_PATH)

  // Create indexes (matching database.ts)
  await db.createIndex({index: {fields: ['type']}})
  await db.createIndex({index: {fields: ['type', 'scheduled.date']}})
  await db.createIndex({index: {fields: ['type', 'status']}})
  await db.createIndex({index: {fields: ['type', 'createdAt']}})
  await db.createIndex({index: {fields: ['type', 'updatedAt']}})

  console.log('✅ Connected to PouchDB')
  console.log()

  return db
}

/**
 * Clear all documents from PouchDB
 */
async function clearDB(db) {
  console.log('🧹 Clearing existing PouchDB data...')

  try {
    const result = await db.allDocs({include_docs: true})

    if (result.rows.length === 0) {
      console.log('   Database is already empty')
      return
    }

    console.log(`   Found ${result.rows.length} documents to delete`)

    const docsToDelete = result.rows.map(row => ({
      _id: row.id,
      _rev: row.doc._rev,
      _deleted: true,
    }))

    await db.bulkDocs(docsToDelete)
    console.log(`✅ Cleared ${docsToDelete.length} documents`)
  } catch (error) {
    console.error('❌ Failed to clear database:', error)
    throw error
  }

  console.log()
}

/* ============================================ */
/* ============ MIGRATION FUNCTIONS ========== */
/* ============================================ */

/**
 * Migrate settings from .config.json to SettingsDoc
 */
async function migrateSettings(db) {
  console.log('⚙️  Migrating settings...')

  if (!(await pathExists(LEGACY_CONFIG_FILE))) {
    console.log('   No .config.json found, using defaults')

    const defaultSettings = {
      _id: 'settings:default',
      type: 'settings',
      data: {
        version: nanoid(),
        themes: {
          current: 'github-light',
          preferred_light: 'github-light',
          preferred_dark: 'github-dark',
          use_system: true,
        },
        sidebar: {collapsed: false},
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.put(defaultSettings)
    console.log('✅ Created default settings')
    console.log()
    return
  }

  try {
    const configData = JSON.parse(await readFile(LEGACY_CONFIG_FILE, 'utf-8'))

    const settingsDoc = {
      _id: 'settings:default',
      type: 'settings',
      data: configData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.put(settingsDoc)
    console.log('✅ Migrated settings')
  } catch (error) {
    console.error('❌ Failed to migrate settings:', error)
    throw error
  }

  console.log()
}

/**
 * Migrate tags from .meta.json to TagDoc
 */
async function migrateTags(db, metaData) {
  console.log('🏷️  Migrating tags...')

  const tags = Object.values(metaData.tags || {})

  if (tags.length === 0) {
    console.log('   No tags found')
    console.log()
    return []
  }

  console.log(`   Found ${tags.length} tags`)

  try {
    const tagDocs = tags.map(tag => ({
      _id: `tag:${tag.name}`,
      type: 'tag',
      name: tag.name,
      color: tag.color,
      emoji: tag.emoji,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))

    await db.bulkDocs(tagDocs)
    console.log(`✅ Migrated ${tagDocs.length} tags`)
  } catch (error) {
    console.error('❌ Failed to migrate tags:', error)
    throw error
  }

  console.log()
  return tags
}

/**
 * Migrate tasks from markdown files to TaskDoc
 */
async function migrateTasks(db, metaData, tagsMap) {
  console.log('📝 Migrating tasks...')

  const tasksMetadata = Object.values(metaData.tasks || {})

  if (tasksMetadata.length === 0) {
    console.log('   No tasks found')
    console.log()
    return
  }

  console.log(`   Found ${tasksMetadata.length} tasks in .meta.json`)

  const taskDocs = []
  const errors = []
  const skippedByStatus = []
  const skippedByFile = []
  const dateStats = new Map() // Track tasks by date
  const migratedByMonth = new Map() // Track successfully migrated tasks by month

  for (const taskMeta of tasksMetadata) {
    try {
      const taskDate = taskMeta.scheduled?.date || 'unknown'
      const dateKey = taskDate !== 'unknown' && taskDate.length >= 7 ? taskDate.substring(0, 7) : 'unknown' // YYYY-MM for grouping
      dateStats.set(dateKey, (dateStats.get(dateKey) || 0) + 1)

      const taskPath = path.join(LEGACY_ROOT, taskMeta.file)

      if (!(await pathExists(taskPath))) {
        const errorMsg = `Task file missing: ${taskMeta.file} (date: ${taskDate})`
        console.warn(`   ⚠️  ${errorMsg}`)
        skippedByFile.push({id: taskMeta.id, file: taskMeta.file, date: taskDate})
        errors.push(errorMsg)
        continue
      }

      // Read and parse markdown file
      const raw = await readFile(taskPath, 'utf-8')
      const parsed = matter(raw)
      const frontmatter = parsed.data || {}
      const content = parsed.content?.trim() || ''

      // Get actual date from frontmatter if not in meta
      const actualDate = taskMeta.scheduled?.date || frontmatter.date || 'unknown'
      const actualDateKey = actualDate !== 'unknown' && actualDate.length >= 7 ? actualDate.substring(0, 7) : 'unknown'

      // Validate status - use default if missing
      const validStatuses = ['active', 'done', 'discarded']
      let status = frontmatter.status?.toLowerCase()

      if (!status || !validStatuses.includes(status)) {
        // Use default status if missing or invalid
        status = 'active'
        if (frontmatter.status) {
          console.warn(`   ⚠️  Invalid status "${frontmatter.status}" in task ${taskMeta.id}, using default "active"`)
          skippedByStatus.push({id: taskMeta.id, status: frontmatter.status, date: taskDate})
        }
      }

      // Sanitize ID - PouchDB doesn't allow IDs starting with underscore
      let taskId = taskMeta.id
      if (taskId.startsWith('_')) {
        taskId = taskId.slice(1) // Remove leading underscore
        console.log(`   🔧 Sanitized ID: ${taskMeta.id} → ${taskId}`)
      }

      // Convert to TaskDoc format (matching docIdMap.task.toDoc format)
      // Normalize date to YYYY-MM-DD format
      const rawDate = taskMeta.scheduled?.date || frontmatter.date || ''
      const finalDate = normalizeDate(rawDate)
      
      if (!finalDate) {
        const errorMsg = `Task ${taskMeta.id} has invalid or missing date: ${rawDate}`
        console.warn(`   ⚠️  ${errorMsg}`)
        errors.push(errorMsg)
        continue
      }

      const taskDoc = {
        _id: `task:${taskId}`,
        type: 'task',
        status: status,
        scheduled: {
          date: finalDate,
          time: taskMeta.scheduled?.time || frontmatter.time || '',
          timezone: taskMeta.scheduled?.timezone || frontmatter.timezone || '',
        },
        estimatedTime: taskMeta.estimated || parseDuration(frontmatter.estimated),
        spentTime: taskMeta.spent || parseDuration(frontmatter.spent),
        content: content,
        tagNames: (frontmatter.tags || []).filter(tagName => tagsMap.has(tagName)),
        attachments: [], // Initialize empty attachments array
        createdAt: taskMeta.createdAt || new Date().toISOString(),
        updatedAt: taskMeta.updatedAt || new Date().toISOString(),
      }

      taskDocs.push(taskDoc)
      
      // Track successfully processed tasks by month
      if (finalDate && finalDate.length >= 7) {
        const monthKey = finalDate.substring(0, 7)
        migratedByMonth.set(monthKey, (migratedByMonth.get(monthKey) || 0) + 1)
      }
    } catch (error) {
      const errorMsg = `Failed to process task ${taskMeta.id}: ${error.message}`
      console.error(`   ❌ ${errorMsg}`)
      errors.push(errorMsg)
    }
  }

  if (taskDocs.length === 0) {
    console.log('   No valid tasks to migrate')
    console.log()
    return
  }

  // Log date statistics
  console.log('   📊 Tasks found in .meta.json by month:')
  const sortedDates = Array.from(dateStats.entries()).sort()
  sortedDates.forEach(([month, count]) => {
    console.log(`      ${month}: ${count} tasks`)
  })
  console.log()

  try {
    await db.bulkDocs(taskDocs)
    console.log(`✅ Migrated ${taskDocs.length} tasks`)

    // Log successfully migrated tasks by month
    if (migratedByMonth.size > 0) {
      console.log('   📊 Successfully migrated tasks by month:')
      const sortedMigrated = Array.from(migratedByMonth.entries()).sort()
      sortedMigrated.forEach(([month, count]) => {
        console.log(`      ${month}: ${count} tasks`)
      })
      console.log()
    }

    if (skippedByFile.length > 0) {
      console.log(`   ⚠️  ${skippedByFile.length} tasks skipped (missing files):`)
      skippedByFile.slice(0, 10).forEach(item => {
        console.log(`      - ${item.id} (${item.date}): ${item.file}`)
      })
      if (skippedByFile.length > 10) {
        console.log(`      ... and ${skippedByFile.length - 10} more`)
      }
    }

    if (skippedByStatus.length > 0) {
      console.log(`   ⚠️  ${skippedByStatus.length} tasks had invalid status (using default):`)
      skippedByStatus.slice(0, 10).forEach(item => {
        console.log(`      - ${item.id} (${item.date}): status="${item.status}"`)
      })
      if (skippedByStatus.length > 10) {
        console.log(`      ... and ${skippedByStatus.length - 10} more`)
      }
    }

    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} tasks had errors:`)
      errors.slice(0, 10).forEach(err => console.log(`      - ${err}`))
      if (errors.length > 10) {
        console.log(`      ... and ${errors.length - 10} more errors`)
      }
    }
  } catch (error) {
    console.error('❌ Failed to save tasks to database:', error)
    throw error
  }

  console.log()
}

/**
 * Migrate assets from assets/ folder to FileDoc with attachments
 * (matching FileModel.createFile approach)
 */
async function migrateAssets(db) {
  console.log('🖼️  Migrating assets...')

  if (!(await pathExists(LEGACY_ASSETS_DIR))) {
    console.log('   No assets/ directory found')
    console.log()
    return
  }

  try {
    const files = await readdir(LEGACY_ASSETS_DIR)

    if (files.length === 0) {
      console.log('   No assets found')
      console.log()
      return
    }

    console.log(`   Found ${files.length} asset files`)

    let migrated = 0
    const errors = []

    for (const filename of files) {
      // Skip hidden files and directories
      if (filename.startsWith('.')) continue

      try {
        const assetPath = path.join(LEGACY_ASSETS_DIR, filename)
        const data = await readFile(assetPath)

        const extension = path.extname(filename).slice(1)
        const mimeType = getMimeType(extension)
        const fileId = nanoid() // Just the ID, not prefixed
        const now = new Date().toISOString()

        console.log(`   📎 Migrating: ${filename} → file:${fileId}`)

        // Create FileDoc with attachment (matching fileToDoc approach)
        const fileDoc = {
          _id: `file:${fileId}`,
          type: 'file',
          name: filename,
          mimeType,
          size: data.length,
          createdAt: now,
          updatedAt: now,
          _attachments: {
            data: {
              content_type: mimeType,
              data: data.toString('base64'),
            },
          },
        }

        await db.put(fileDoc)

        migrated++
      } catch (error) {
        console.error(`   ❌ Failed to migrate asset ${filename}:`, error.message)
        errors.push(`${filename}: ${error.message}`)
      }
    }

    console.log(`✅ Migrated ${migrated} assets`)

    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} assets had errors:`)
      errors.forEach(err => console.log(`      - ${err}`))
    }
  } catch (error) {
    console.error('❌ Failed to read assets directory:', error)
    throw error
  }

  console.log()
}

/* ============================================ */
/* ============== MAIN MIGRATION ============= */
/* ============================================ */

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting migration from legacy storage to PouchDB')
  console.log('=' .repeat(60))
  console.log()

  // Check if legacy directory exists
  if (!(await pathExists(LEGACY_ROOT))) {
    console.error(`❌ Legacy directory not found: ${LEGACY_ROOT}`)
    console.error('   Nothing to migrate.')
    process.exit(1)
  }

  // Check if .meta.json exists
  if (!(await pathExists(LEGACY_META_FILE))) {
    console.error(`❌ .meta.json not found: ${LEGACY_META_FILE}`)
    console.error('   Cannot proceed without metadata.')
    process.exit(1)
  }

  try {
    // Initialize database
    const db = await initDB()

    // Clear existing data
    await clearDB(db)

    // Read legacy metadata
    console.log('📖 Reading legacy .meta.json...')
    const metaData = JSON.parse(await readFile(LEGACY_META_FILE, 'utf-8'))
    console.log(`   Version: ${metaData.version || 'unknown'}`)
    console.log(`   Tasks in metadata: ${Object.keys(metaData.tasks || {}).length}`)
    console.log(`   Tags in metadata: ${Object.keys(metaData.tags || {}).length}`)
    
    // Analyze task dates from metadata
    if (metaData.tasks && Object.keys(metaData.tasks).length > 0) {
      const taskDates = new Map()
      Object.values(metaData.tasks).forEach(task => {
        const date = task.scheduled?.date || 'unknown'
        const month = date !== 'unknown' && date.length >= 7 ? date.substring(0, 7) : 'unknown'
        taskDates.set(month, (taskDates.get(month) || 0) + 1)
      })
      
      if (taskDates.size > 0) {
        console.log('   📅 Task dates in metadata:')
        const sortedTaskDates = Array.from(taskDates.entries()).sort()
        sortedTaskDates.forEach(([month, count]) => {
          console.log(`      ${month}: ${count} tasks`)
        })
      }
    }
    console.log()

    // Migrate in order
    await migrateSettings(db)

    const tags = await migrateTags(db, metaData)
    const tagsMap = new Map(tags.map(tag => [tag.name, tag]))

    await migrateTasks(db, metaData, tagsMap)

    await migrateAssets(db)

    // Final summary
    console.log('=' .repeat(60))
    console.log('✅ Migration completed successfully!')
    console.log()
    console.log('📊 Final Summary:')

    const allDocs = await db.allDocs()
    const docsByType = {}
    const taskDatesInDB = new Map()

    for (const row of allDocs.rows) {
      const type = row.id.split(':')[0]
      docsByType[type] = (docsByType[type] || 0) + 1
      
      // Count tasks by date in database
      if (type === 'task' && row.doc) {
        const taskDate = row.doc.scheduled?.date || 'unknown'
        if (taskDate !== 'unknown' && taskDate.length >= 7) {
          const month = taskDate.substring(0, 7)
          taskDatesInDB.set(month, (taskDatesInDB.get(month) || 0) + 1)
        }
      }
    }

    console.log(`   Total documents: ${allDocs.rows.length}`)
    Object.entries(docsByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`)
    })
    
    if (taskDatesInDB.size > 0) {
      console.log()
      console.log('   📅 Tasks in database by month:')
      const sortedTaskDatesInDB = Array.from(taskDatesInDB.entries()).sort()
      sortedTaskDatesInDB.forEach(([month, count]) => {
        console.log(`      ${month}: ${count} tasks`)
      })
    }

    console.log()
    console.log('💡 Next steps:')
    console.log('   1. Test the application to ensure all data is accessible')
    console.log('   2. Old files in Documents/Daily/ have been left untouched')
    console.log('   3. You can manually archive/delete them once you verify everything works')
    console.log()

    await db.close()
    process.exit(0)
  } catch (error) {
    console.error()
    console.error('=' .repeat(60))
    console.error('❌ Migration failed!')
    console.error()
    console.error('Error:', error.message)
    console.error()
    console.error('Stack trace:')
    console.error(error.stack)
    console.error()
    process.exit(1)
  }
}

// Run migration
migrate()
