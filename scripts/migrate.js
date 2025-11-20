/**
 * Legacy Data Migration Script
 *
 * Migrates data from old file-based storage to PouchDB:
 * - ~/Documents/Daily/ → ~/Library/Application Support/Daily/db/
 *
 * Source structure:
 * - Documents/Daily/.meta.json (tasks metadata)
 * - Documents/Daily/.config.json (settings)
 * - Documents/Daily/YYYY-MM-DD/*.md (task files)
 * - Documents/Daily/assets/* (asset files)
 *
 * Target structure:
 * - PouchDB with TaskDoc, TagDoc, SettingsDoc, AssetDoc
 *
 * Usage: pnpm migrate
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

const LEGACY_ROOT = path.join('/Users/olegardo/Library/Mobile Documents/com~apple~CloudDocs/Daily')
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
 * Parse duration string (e.g., "2 h. 30 min.") to milliseconds
 */
function parseDuration(str) {
  if (!str || str === '-') return 0

  let total = 0
  const hourMatch = str.match(/(\d+)\s*h/)
  const minMatch = str.match(/(\d+)\s*min/)

  if (hourMatch) total += parseInt(hourMatch[1]) * 60 * 60 * 1000
  if (minMatch) total += parseInt(minMatch[1]) * 60 * 1000

  return total
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

  // Create indexes
  await db.createIndex({index: {fields: ['type']}})
  await db.createIndex({index: {fields: ['type', 'scheduled.date']}})
  await db.createIndex({index: {fields: ['type', 'status']}})

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

  for (const taskMeta of tasksMetadata) {
    try {
      const taskPath = path.join(LEGACY_ROOT, taskMeta.file)

      if (!(await pathExists(taskPath))) {
        console.warn(`   ⚠️  Task file missing: ${taskMeta.file}`)
        errors.push(`Missing file: ${taskMeta.file}`)
        continue
      }

      // Read and parse markdown file
      const raw = await readFile(taskPath, 'utf-8')
      const parsed = matter(raw)
      const frontmatter = parsed.data || {}
      const content = parsed.content?.trim() || ''

      // Validate status
      const validStatuses = ['active', 'done', 'discarded']
      const status = frontmatter.status?.toLowerCase()

      if (!validStatuses.includes(status)) {
        console.warn(`   ⚠️  Invalid status in task ${taskMeta.id}: ${status}`)
        errors.push(`Invalid status: ${taskMeta.id}`)
        continue
      }

      // Sanitize ID - PouchDB doesn't allow IDs starting with underscore
      let taskId = taskMeta.id
      if (taskId.startsWith('_')) {
        taskId = 'task' + taskId
        console.log(`   🔧 Sanitized ID: ${taskMeta.id} → ${taskId}`)
      }

      // Convert to TaskDoc format
      const taskDoc = {
        _id: taskId,
        type: 'task',
        status: status,
        scheduled: {
          date: taskMeta.scheduled?.date || frontmatter.date,
          time: taskMeta.scheduled?.time || '',
          timezone: taskMeta.scheduled?.timezone || '',
        },
        estimatedTime: taskMeta.estimated || parseDuration(frontmatter.estimated),
        spentTime: taskMeta.spent || parseDuration(frontmatter.spent),
        content: content,
        tagNames: (frontmatter.tags || []).filter(tagName => tagsMap.has(tagName)),
        createdAt: taskMeta.createdAt || new Date().toISOString(),
        updatedAt: taskMeta.updatedAt || new Date().toISOString(),
      }

      taskDocs.push(taskDoc)
    } catch (error) {
      console.error(`   ❌ Failed to process task ${taskMeta.id}:`, error.message)
      errors.push(`Error in ${taskMeta.id}: ${error.message}`)
    }
  }

  if (taskDocs.length === 0) {
    console.log('   No valid tasks to migrate')
    console.log()
    return
  }

  try {
    await db.bulkDocs(taskDocs)
    console.log(`✅ Migrated ${taskDocs.length} tasks`)

    if (errors.length > 0) {
      console.log(`   ⚠️  ${errors.length} tasks had errors:`)
      errors.forEach(err => console.log(`      - ${err}`))
    }
  } catch (error) {
    console.error('❌ Failed to save tasks to database:', error)
    throw error
  }

  console.log()
}

/**
 * Migrate assets from assets/ folder to AssetDoc with attachments
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
        const assetId = `asset:${nanoid()}`
        const now = new Date().toISOString()

        console.log(`   📎 Migrating: ${filename} → ${assetId}`)

        // Step 1: Create document without attachment
        const docWithoutAttachment = {
          _id: assetId,
          type: 'asset',
          name: filename,
          mimeType,
          size: data.length,
          publicIn: [],
          createdAt: now,
          updatedAt: now,
        }

        const putResult = await db.put(docWithoutAttachment)

        // Step 2: Add attachment
        await db.putAttachment(assetId, 'data', putResult.rev, data, mimeType)

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
    console.log(`   Version: ${metaData.version}`)
    console.log(`   Tasks: ${Object.keys(metaData.tasks || {}).length}`)
    console.log(`   Tags: ${Object.keys(metaData.tags || {}).length}`)
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
    console.log('📊 Summary:')

    const allDocs = await db.allDocs()
    const docsByType = {}

    for (const row of allDocs.rows) {
      const type = row.id.split(':')[0]
      docsByType[type] = (docsByType[type] || 0) + 1
    }

    console.log(`   Total documents: ${allDocs.rows.length}`)
    Object.entries(docsByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`)
    })

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
