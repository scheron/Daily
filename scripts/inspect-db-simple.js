import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import PouchDB from 'pouchdb'
import chalk from 'chalk'

// Буфер для сохранения вывода
let outputBuffer = []
const shouldSave = process.argv.includes('--save') || process.argv.some(arg => arg.startsWith('--output'))

// Перехватываем console.log если нужно сохранять
const originalLog = console.log
if (shouldSave) {
  console.log = (...args) => {
    // Выводим в консоль с цветами
    originalLog(...args)
    // Сохраняем в буфер без цветов (убираем ANSI коды)
    const plainText = args.map(arg => 
      typeof arg === 'string' ? arg.replace(/\u001b\[\d+m/g, '') : String(arg)
    ).join(' ')
    outputBuffer.push(plainText)
  }
}

/**
 * Получить путь к БД в зависимости от платформы
 */
function getDbPath() {
  const platform = os.platform()
  const home = os.homedir()
  
  let appDataPath
  
  if (platform === 'darwin') {
    // macOS
    appDataPath = path.join(home, 'Library', 'Application Support', 'Daily')
  } else if (platform === 'win32') {
    // Windows
    appDataPath = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Daily')
  } else {
    // Linux
    appDataPath = path.join(home, '.config', 'Daily')
  }
  
  return path.join(appDataPath, 'db')
}

// Главная функция
async function main() {
  try {
    // Получаем путь к БД
    const dbPath = getDbPath()
    
    console.log(chalk.blue.bold('\n📂 PouchDB Inspector\n'))
    console.log(chalk.gray(`Database path: ${dbPath}\n`))

    // Проверяем существование БД
    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow('⚠️  База данных не найдена'))
      console.log(chalk.gray(`Путь: ${dbPath}`))
      return
    }

    // Открываем БД
    const db = new PouchDB(dbPath)

    // Получаем все документы
    const result = await db.allDocs({
      include_docs: true,
      attachments: false // не загружаем attachment'ы для быстроты
    })

    const docs = result.rows.map(row => row.doc)
    
    // Группируем документы по типам
    const docsByType = {
      task: [],
      tag: [],
      settings: [],
      asset: [],
    }

    docs.forEach(doc => {
      const type = doc.type
      if (docsByType[type]) {
        docsByType[type].push(doc)
      }
    })

    // Определяем режим работы из аргументов
    const args = process.argv.slice(2)
    const mode = args.includes('--export') ? 'export' 
               : args.includes('--ids') ? 'ids' 
               : 'full'

    // Выводим данные в зависимости от режима
    if (mode === 'export') {
      await exportToJson(docs, docsByType)
    } else if (mode === 'ids') {
      displayIds(docsByType)
    } else {
      displayFull(docsByType)
    }

    // Сохраняем вывод в файл если требуется
    if (shouldSave) {
      saveOutputToFile()
    }

    // Закрываем БД
    await db.close()

  } catch (error) {
    console.error(chalk.red('❌ Ошибка:'), error)
    process.exit(1)
  }
}

// Запускаем
main()

/**
 * Полный вывод документов в консоль
 */
function displayFull(docsByType) {
  console.log(chalk.green.bold('📊 Статистика:\n'))
  
  const stats = {
    'Tasks': docsByType.task.length,
    'Tags': docsByType.tag.length,
    'Settings': docsByType.settings.length,
    'Assets': docsByType.asset.length,
  }

  Object.entries(stats).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`  ${chalk.cyan(type.padEnd(12))}: ${chalk.yellow(count)}`)
    }
  })

  const total = Object.values(stats).reduce((sum, count) => sum + count, 0)
  console.log(`  ${chalk.cyan('Total'.padEnd(12))}: ${chalk.yellow.bold(total)}`)
  console.log()

  // Выводим документы по типам
  if (docsByType.task.length > 0) {
    console.log(chalk.magenta.bold('📝 Tasks:\n'))
    docsByType.task.forEach(doc => {
      const statusEmoji = doc.status === 'done' ? '✅' : doc.status === 'discarded' ? '❌' : '⏳'
      console.log(`  ${statusEmoji} ${chalk.bold(doc._id)}`)
      console.log(`     Status: ${chalk.yellow(doc.status)}`)
      console.log(`     Scheduled: ${chalk.cyan(doc.scheduled?.date)} ${doc.scheduled?.time || ''}`)
      console.log(`     Tags: ${doc.tagNames?.join(', ') || 'none'}`)
      console.log(`     Time: ${doc.spentTime || 0}/${doc.estimatedTime || 0} min`)
      if (doc.content) {
        const preview = doc.content.slice(0, 60).replace(/\n/g, ' ')
        console.log(`     Content: ${chalk.gray(preview)}${doc.content.length > 60 ? '...' : ''}`)
      }
      console.log(`     Updated: ${chalk.gray(new Date(doc.updatedAt).toLocaleString())}`)
      console.log()
    })
  }

  if (docsByType.tag.length > 0) {
    console.log(chalk.magenta.bold('🏷️  Tags:\n'))
    docsByType.tag.forEach(doc => {
      console.log(`  ${doc.emoji || '🏷️ '} ${chalk.bold(doc.name)}`)
      console.log(`     ID: ${doc._id}`)
      console.log(`     Color: ${chalk.hex(doc.color || '#999999')(doc.color || 'default')}`)
      console.log(`     Sort order: ${doc.sortOrder ?? 'none'}`)
      console.log()
    })
  }

  if (docsByType.settings.length > 0) {
    console.log(chalk.magenta.bold('⚙️  Settings:\n'))
    docsByType.settings.forEach(doc => {
      console.log(`  ${chalk.bold(doc._id)}`)
      console.log(`     Theme: ${chalk.cyan(doc.data?.themes?.current || 'unknown')}`)
      console.log(`     Version: ${doc.data?.version || 'unknown'}`)
      console.log(`     Sidebar collapsed: ${doc.data?.sidebar?.collapsed ? 'Yes' : 'No'}`)
      console.log()
    })
  }

  if (docsByType.asset.length > 0) {
    console.log(chalk.magenta.bold('📎 Assets:\n'))
    docsByType.asset.forEach(doc => {
      console.log(`  📎 ${chalk.bold(doc.name)}`)
      console.log(`     ID: ${doc._id}`)
      console.log(`     Type: ${doc.mimeType}`)
      console.log(`     Size: ${formatBytes(doc.size)}`)
      console.log(`     Used in: ${doc.publicIn?.length || 0} task(s)`)
      console.log()
    })
  }
}

/**
 * Вывод только ID документов
 */
function displayIds(docsByType) {
  console.log(chalk.green.bold('📋 Document IDs:\n'))

  Object.entries(docsByType).forEach(([type, docs]) => {
    if (docs.length > 0) {
      console.log(chalk.cyan.bold(`\n${type.toUpperCase()}:`))
      docs.forEach(doc => {
        console.log(`  ${doc._id}`)
      })
    }
  })
  console.log()
}

/**
 * Экспорт в JSON файл
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
      assets: docsByType.asset.length,
      other: docsByType.other.length,
    },
    documents: docs
  }

  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf-8')

  console.log(chalk.green('✅ Экспорт завершен'))
  console.log(chalk.gray(`Файл: ${exportPath}`))
  console.log(chalk.gray(`Документов: ${docs.length}`))
}

/**
 * Форматирование размера в байтах
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Сохранение вывода в файл
 */
function saveOutputToFile() {
  // Определяем имя файла
  let filename
  const outputArgIndex = process.argv.findIndex(arg => arg === '--output')
  
  if (outputArgIndex !== -1 && process.argv[outputArgIndex + 1]) {
    // Используем указанное имя файла
    filename = process.argv[outputArgIndex + 1]
  } else {
    // Генерируем имя файла с timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    filename = `pouchdb-inspect-${timestamp}.txt`
  }

  const outputPath = path.join(process.cwd(), filename)
  const content = outputBuffer.join('\n')

  try {
    fs.writeFileSync(outputPath, content, 'utf-8')
    originalLog(chalk.green('\n✅ Вывод сохранен в файл'))
    originalLog(chalk.gray(`Файл: ${outputPath}`))
    originalLog(chalk.gray(`Размер: ${formatBytes(Buffer.byteLength(content, 'utf-8'))}`))
  } catch (error) {
    originalLog(chalk.red('\n❌ Ошибка при сохранении файла:'), error.message)
  }
}

