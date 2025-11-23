/**
 * Export all PouchDB documents to JSON format
 * 
 * Usage:
 *   node scripts/export-db-json.js [output-file]
 * 
 * If output-file is not specified, outputs to stdout
 */

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import PouchDB from 'pouchdb'

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
    const outputFile = process.argv[2]
    
    if (!fs.existsSync(dbPath)) {
      console.error(`❌ База данных не найдена: ${dbPath}`)
      process.exit(1)
    }

    const db = new PouchDB(dbPath)

    // Get all documents
    const result = await db.allDocs({
      include_docs: true,
      attachments: false
    })

    const docs = result.rows.map(row => row.doc)
    
    // For file documents, load attachments if needed
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      if (doc.type === 'file' && doc._attachments) {
        try {
          const docWithAttachment = await db.get(doc._id, {
            attachments: true,
            binary: false
          })
          docs[i] = docWithAttachment
        } catch (error) {
          console.error(`⚠️  Не удалось загрузить attachment для файла ${doc._id}:`, error.message)
        }
      }
    }

    // Prepare export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      databasePath: dbPath,
      total: docs.length,
      documents: docs
    }

    const jsonOutput = JSON.stringify(exportData, null, 2)

    if (outputFile) {
      // Write to file
      fs.writeFileSync(outputFile, jsonOutput, 'utf-8')
      console.log(`✅ Данные экспортированы в файл: ${outputFile}`)
      console.log(`   Всего документов: ${docs.length}`)
    } else {
      // Output to stdout
      console.log(jsonOutput)
    }

    await db.close()

  } catch (error) {
    console.error('❌ Ошибка:', error)
    process.exit(1)
  }
}

main()

