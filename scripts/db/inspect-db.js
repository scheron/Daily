import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import PouchDB from 'pouchdb'

let outputBuffer = []

/**
 * Log function that writes to buffer
 */
function log(...args) {
  const text = args.map(arg => String(arg)).join(' ')
  outputBuffer.push(text)
}

/**
 * Get database path based on platform
 */
function getDbPath() {
  const platform = os.platform()
  const home = os.homedir()
  
  let appDataPath
  
  if (platform === 'darwin') {
    appDataPath = path.join(home, 'Library', 'Application Support', 'Daily')
  } else if (platform === 'win32') {
    appDataPath = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Daily')
  } else {
    appDataPath = path.join(home, '.config', 'Daily')
  }
  
  return path.join(appDataPath, 'db')
}

async function main() {
  try {
    const dbPath = getDbPath()
    
    log('\n📂 PouchDB Inspector\n')
    log(`Database path: ${dbPath}\n`)

    if (!fs.existsSync(dbPath)) {
      log('⚠️  Database not found')
      log(`Path: ${dbPath}`)
      return
    }

    const db = new PouchDB(dbPath)

    const result = await db.allDocs({
      include_docs: true,
      attachments: false
    })

    const docs = result.rows.map(row => row.doc)
    
    const docsByType = {
      task: [],
      tag: [],
      settings: [],
      file: [],
    }

    docs.forEach(doc => {
      const type = doc.type
      if (docsByType[type]) {
        docsByType[type].push(doc)
      }
    })

    if (docsByType.file.length > 0) {
      for (let i = 0; i < docsByType.file.length; i++) {
        const fileDoc = docsByType.file[i]
        try {
          const docWithAttachment = await db.get(fileDoc._id, {
            attachments: true,
            binary: false
          })
          docsByType.file[i] = docWithAttachment
        } catch (error) {
          log(`⚠️  Failed to load attachment for file ${fileDoc._id}:`, error.message)
        }
      }
    }

    const args = process.argv.slice(2)
    const mode = args.includes('--export') ? 'export' 
               : args.includes('--ids') ? 'ids' 
               : 'full'

    if (mode === 'export') {
      await exportToJson(docs, docsByType)
    } else if (mode === 'ids') {
      displayIds(docsByType)
    } else {
      displayFull(docsByType)
    }

    saveOutputToFile()

    await db.close()

  } catch (error) {
    log('❌ Error:', error)
    process.exit(1)
  }
}

main()

/**
 * Display full document output in console
 */
function displayFull(docsByType) {
  log('📊 Statistics:\n')
  
  const stats = {
    'Tasks': docsByType.task.length,
    'Tags': docsByType.tag.length,
    'Settings': docsByType.settings.length,
    'Files': docsByType.file.length,
  }

  Object.entries(stats).forEach(([type, count]) => {
    if (count > 0) {
      log(`  ${type.padEnd(12)}: ${count}`)
    }
  })

  const total = Object.values(stats).reduce((sum, count) => sum + count, 0)
  log(`  ${'Total'.padEnd(12)}: ${total}`)
  log()

  if (docsByType.task.length > 0) {
    log('📝 Tasks:\n')
    docsByType.task.forEach(doc => {
      const statusEmoji = doc.status === 'done' ? '✅' : doc.status === 'discarded' ? '❌' : '⏳'
      log(`  ${statusEmoji} ${doc._id}`)
      log(`     Status: ${doc.status}`)
      log(`     Scheduled: ${doc.scheduled?.date} ${doc.scheduled?.time || ''}`)
      log(`     Tags: ${doc.tagNames?.join(', ') || 'none'}`)
      log(`     Time: ${doc.spentTime || 0}/${doc.estimatedTime || 0} min`)
      log(`     Attachments: ${doc.attachments?.join(', ') || 'none'}`)
      if (doc.content) {
        const preview = doc.content.slice(0, 60).replace(/\n/g, ' ')
        log(`     Content: ${preview}${doc.content.length > 60 ? '...' : ''}`)
      }
      log(`     Updated: ${new Date(doc.updatedAt).toLocaleString()}`)
      log()
    })
  }

  if (docsByType.tag.length > 0) {
    log('🏷️  Tags:\n')
    docsByType.tag.forEach(doc => {
      log(`  ${doc.emoji || '🏷️ '} ${doc.name}`)
      log(`     ID: ${doc._id}`)
      log(`     Color: ${doc.color || 'default'}`)
      log(`     Sort order: ${doc.sortOrder ?? 'none'}`)
      log()
    })
  }

  if (docsByType.settings.length > 0) {
    log('⚙️  Settings:\n')
    docsByType.settings.forEach(doc => {
      log(`  ${doc._id}`)
      log(`     Theme: ${doc.data?.themes?.current || 'unknown'}`)
      log(`     Version: ${doc.data?.version || 'unknown'}`)
      log(`     Sidebar collapsed: ${doc.data?.sidebar?.collapsed ? 'Yes' : 'No'}`)
      log()
    })
  }

  if (docsByType.file.length > 0) {
    log('📎 Files:\n')
    docsByType.file.forEach(doc => {
      log(`  📎 ${doc.name}`)
      log(`     ID: ${doc._id}`)
      log(`     Type: ${doc.mimeType}`)
      log(`     Size: ${formatBytes(doc.size)}`)
      
      const attachment = doc._attachments?.data
      if (attachment) {
        const data = attachment.data
        const dataStr = typeof data === 'string' ? data : '[Blob]'
        const previewLength = 100
        const preview = dataStr.length > previewLength 
          ? dataStr.substring(0, previewLength) + '...' 
          : dataStr
        log(`     Has attachment: Yes`)
        log(`     Attachment type: ${attachment.content_type || 'unknown'}`)
        log(`     Attachment size: ${formatBytes(attachment.length || 0)}`)
        log(`     Attachment data (preview): ${preview}`)
      } else {
        log(`     Has attachment: No`)
      }
      
      log(`     Created: ${new Date(doc.createdAt).toLocaleString()}`)
      log(`     Updated: ${new Date(doc.updatedAt).toLocaleString()}`)
      log()
    })
  }
}

/**
 * Display only document IDs
 */
function displayIds(docsByType) {
  log('📋 Document IDs:\n')

  Object.entries(docsByType).forEach(([type, docs]) => {
    if (docs.length > 0) {
      log(`\n${type.toUpperCase()}:`)
      docs.forEach(doc => {
        log(`  ${doc._id}`)
      })
    }
  })
  log()
}

/**
 * Export to JSON file
 */
async function exportToJson(docs, docsByType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `pouchdb-export-${timestamp}.json`
  const exportPath = path.join(process.cwd(), filename)

  const exportData = {
    exportedAt: new Date().toISOString(),
    total: docs.length,
    stats: {
      tasks: docsByType.task.length,
      tags: docsByType.tag.length,
      settings: docsByType.settings.length,
      files: docsByType.file.length,
    },
    documents: docs
  }

  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf-8')

  log('✅ Export completed')
  log(`File: ${exportPath}`)
  log(`Documents: ${docs.length}`)
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Save output to file
 */
function saveOutputToFile() {
  let filename
  const outputArgIndex = process.argv.findIndex(arg => arg === '--output')
  
  if (outputArgIndex !== -1 && process.argv[outputArgIndex + 1]) {
    filename = process.argv[outputArgIndex + 1]
  } else {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    filename = `pouchdb-inspect-${timestamp}.txt`
  }

  const outputPath = path.join(process.cwd(), filename)
  const content = outputBuffer.join('\n')

  fs.writeFileSync(outputPath, content, 'utf-8')
}

