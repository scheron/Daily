import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import PouchDB from 'pouchdb'
import chalk from 'chalk'
import readline from 'readline'

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

/**
 * Спросить подтверждение у пользователя
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * Главная функция
 */
async function main() {
  try {
    const dbPath = getDbPath()
    
    console.log(chalk.red.bold('\n⚠️  Очистка базы данных Daily\n'))
    console.log(chalk.gray(`Путь к БД: ${dbPath}\n`))

    // Проверяем существование БД
    if (!fs.existsSync(dbPath)) {
      console.log(chalk.yellow('База данных не найдена, нечего удалять.'))
      return
    }

    // Показываем статистику перед удалением
    try {
      const db = new PouchDB(dbPath)
      const result = await db.allDocs({})
      
      console.log(chalk.cyan(`📊 Найдено документов: ${result.total_rows}\n`))
      
      await db.close()
    } catch (error) {
      console.log(chalk.yellow('Не удалось прочитать статистику БД\n'))
    }

    // Проверяем флаг --force
    const forceMode = process.argv.includes('--force') || process.argv.includes('-f')

    if (!forceMode) {
      // Спрашиваем подтверждение
      console.log(chalk.red.bold('⚠️  ВНИМАНИЕ: Это действие необратимо!'))
      console.log(chalk.red('Все задачи, теги, настройки и файлы будут удалены.\n'))
      
      const confirmed = await askConfirmation(chalk.yellow('Вы уверены? (y/N): '))
      
      if (!confirmed) {
        console.log(chalk.gray('\n✋ Операция отменена'))
        return
      }
      console.log() // пустая строка
    }

    // Удаляем базу данных
    console.log(chalk.blue('🗑️  Удаление базы данных...'))
    
    const db = new PouchDB(dbPath)
    await db.destroy()
    
    console.log(chalk.green('✅ База данных успешно очищена!'))
    console.log(chalk.gray('\nПри следующем запуске приложения будет создана новая пустая база данных.\n'))

  } catch (error) {
    console.error(chalk.red('❌ Ошибка:'), error)
    process.exit(1)
  }
}

// Запускаем
main()

