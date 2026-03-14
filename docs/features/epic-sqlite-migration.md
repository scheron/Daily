# EPIC: Миграция с PouchDB на SQLite

## Контекст

Текущий storage layer построен на PouchDB — документоориентированной БД. Все связи между сущностями (task↔tags, task↔branch, task↔files) реализованы через массивы ID в документах с ручной hydration на уровне сервисов. Это приводит к:

- **N+1 паттерну**: каждый запрос задач требует параллельной загрузки всех тегов + построения Map + маппинга для каждой задачи
- **Избыточной сериализации**: PouchDB хранит JSON-документы, каждый read — десериализация + маппинг через `docToTask()`/`docToTag()` и обратно
- **Ограниченности запросов**: PouchDB-Find не поддерживает JOIN'ы, агрегации, подзапросы — вся логика группировки/фильтрации написана на JS
- **Конфликтам ревизий**: механизм `_rev` + `withRetryOnConflict` (до 3 попыток) — артефакт документной модели, не нужный для локальной БД
- **Сложности каскадных операций**: удаление тега требует загрузки ВСЕХ задач и поиска ссылок в JS

SQLite с `better-sqlite3` устраняет эти проблемы: JOIN'ы для hydration, транзакции вместо retry-on-conflict, индексы для любых запросов, FK constraints для целостности.

## Цель эпика

Заменить PouchDB на SQLite (`better-sqlite3`) как единственный persistence layer, сохранив:

- все существующие IPC-контракты (renderer ничего не знает о миграции)
- iCloud sync (адаптировав snapshot формат)
- custom protocol `daily://file/{id}`
- in-memory search index

## Не-цели

- Изменение типов на renderer стороне (`Task`, `Day`, `Tag`, `Branch`, etc.)
- Изменение IPC API или preload bridge
- Переход на серверную БД или cloud-first архитектуру
- Рефактор renderer stores

## Продуктовый результат

- Все операции с данными работают быстрее за счёт нативных SQL-запросов
- Tag hydration происходит в одном SQL JOIN вместо JS-маппинга
- `getDays` с диапазоном — один SQL запрос вместо PouchDB-Find + JS-группировки
- Каскадные операции (удаление тега) — один UPDATE вместо загрузки всех задач
- Целостность данных на уровне FK constraints

## Метрики успеха

- `getDays` (6-month range, 500 tasks): < 20 мс (сейчас ~80-150 мс)
- `getDay` (single day): < 5 мс
- `createTask` / `updateTask`: < 10 мс
- Tag hydration: 0 мс дополнительно (встроена в JOIN)
- Удаление тега с cascade: < 15 мс (сейчас O(N) по всем задачам)
- Размер БД при 1000 задач: сопоставим или меньше PouchDB

---

## Реляционная схема

### Таблицы

```sql
-- Ветки (проекты)
CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,  -- ISODateTime
  updated_at TEXT NOT NULL,
  deleted_at TEXT             -- NULL = active
);

-- Теги
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Задачи
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'done', 'discarded')),
  content TEXT NOT NULL DEFAULT '',
  minimized INTEGER NOT NULL DEFAULT 0,   -- boolean
  order_index REAL NOT NULL DEFAULT 0,
  scheduled_date TEXT NOT NULL,            -- ISODate
  scheduled_time TEXT NOT NULL,            -- ISOTime
  scheduled_timezone TEXT NOT NULL,
  estimated_time INTEGER NOT NULL DEFAULT 0,
  spent_time INTEGER NOT NULL DEFAULT 0,
  branch_id TEXT NOT NULL DEFAULT 'main' REFERENCES branches(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Связь задач и тегов (many-to-many)
CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- Файлы (только метаданные, бинарные данные хранятся на диске)
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Связь задач и файлов (many-to-many)
CREATE TABLE task_attachments (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, file_id)
);

-- Настройки (single row)
CREATE TABLE settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  version TEXT NOT NULL,
  data TEXT NOT NULL,                     -- JSON blob
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Индексы

```sql
CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
CREATE INDEX idx_task_attachments_file ON task_attachments(file_id);
CREATE INDEX idx_tags_active ON tags(id) WHERE deleted_at IS NULL;
```

### Ключевые отличия от PouchDB-схемы

| Аспект              | PouchDB                                | SQLite                                        |
| ------------------- | -------------------------------------- | --------------------------------------------- |
| Task → Tags         | `tags: string[]` в документе           | `task_tags` join table                        |
| Task → Files        | `attachments: string[]` в документе    | `task_attachments` join table                 |
| Task → Branch       | `branchId?: string` (missing = main)   | `branch_id TEXT NOT NULL DEFAULT 'main'` с FK |
| Scheduled           | nested `{date, time, timezone}`        | 3 flat-колонки                                |
| File binary         | `_attachments.data` (base64 в PouchDB) | Файл на диске (`assets/{id}.ext`)             |
| Settings            | `data: Settings` в документе           | `data TEXT` (JSON) — без изменений            |
| Soft delete         | `deletedAt` timestamp convention       | То же + partial indexes                       |
| Conflict resolution | `_rev` + retry on 409                  | Транзакции                                    |
| ID prefixes         | `task:abc`, `tag:xyz`                  | Без префиксов, тип определён таблицей         |

---

## Файловое хранилище на диске

### Проблема текущего подхода

PouchDB хранит бинарные данные файлов как base64 внутри JSON-документов (`_attachments`). Это означает:

- **+33% overhead** — base64 кодирование увеличивает размер каждого файла на треть
- **Раздутая БД** — одна картинка 2MB = 2.7MB в БД, 10 картинок = +27MB к размеру PouchDB
- **Раздутый snapshot** — при iCloud sync все файлы сериализуются в `snapshot.json`, один snapshot может весить сотни мегабайт
- **Медленные операции** — чтение файла = десериализация JSON-документа + base64 decode, запись = encode + сериализация всего документа
- **Нет стриминга** — невозможно отдать файл потоком, всё через буфер в памяти

### Решение: файлы на диске, метаданные в SQLite

Бинарные данные файлов хранятся как обычные файлы на диске. В SQLite остаётся только метаданные (имя, тип, размер). Это разделяет structured data (быстрые SQL-запросы) от unstructured data (файлы, которые эффективнее хранить нативно).

### Структура директорий

```
~/Library/Application Support/Daily/
├── db/
│   └── daily.sqlite              # только structured data
├── assets/                        # локальные файлы
│   ├── abc123.png
│   ├── def456.pdf
│   └── ghi789.jpg
└── sync/
    └── iCloud Drive/
        ├── snapshot.json          # только structured data (задачи, теги, ветки, настройки)
        └── assets/                # файлы для синхронизации
            ├── abc123.png
            ├── def456.pdf
            └── ghi789.jpg
```

**Именование файлов**: `{fileId}.{extension}` — ID из таблицы `files` + оригинальное расширение из `name`. Это гарантирует уникальность и позволяет определить тип файла без обращения к БД.

### Операции с файлами

**Сохранение файла:**

1. Генерируем `fileId` (nanoid)
2. Определяем расширение из `filename`
3. Пишем бинарные данные в `assets/{fileId}.{ext}` через `fs.writeFile`
4. INSERT метаданных в таблицу `files`
5. Возвращаем `fileId`

**Чтение файла (protocol handler `daily://file/{id}`):**

1. SELECT метаданные из `files` по `id` → получаем `name`, `mime_type`
2. Определяем путь: `assets/{id}.{ext}`
3. Возвращаем `new Response(fs.createReadStream(path))` с правильными headers
4. Файл стримится напрямую с диска — нет decode, нет буферизации в память

**Удаление файла (soft delete):**

1. UPDATE `files SET deleted_at = now()` — метаданные помечаются
2. Физический файл пока остаётся на диске

**Orphan cleanup:**

1. SELECT всех `file.id` из `files` WHERE `deleted_at IS NOT NULL` AND `deleted_at < (now - 7 days)`
2. Дополнительно: `fs.readdir(assets/)` → найти файлы без записи в `files` (битые ссылки)
3. `fs.unlink` для каждого orphan
4. DELETE из `files` для soft-deleted записей старше TTL

### Sync с файлами на диске

**Текущая проблема:** snapshot.json содержит base64-encoded файлы, что делает его огромным и медленным для iCloud sync.

**Новый подход:** snapshot содержит ТОЛЬКО structured data. Файлы синхронизируются отдельно через `sync/assets/`.

**Push (export):**

1. Формируем `snapshot.json` из SQLite (задачи, теги, ветки, настройки) — без файлов
2. В `snapshot.json` сохраняем manifest файлов: `files: [{id, name, mimeType, size, hash}]`
3. Копируем новые/изменённые файлы из `assets/` в `sync/assets/`
4. iCloud синхронизирует `snapshot.json` + `sync/assets/` по отдельности

**Pull (import):**

1. Читаем `snapshot.json` — merge structured data через LWW
2. По manifest файлов определяем, какие файлы новые/обновлённые
3. Копируем недостающие файлы из `sync/assets/` в локальный `assets/`
4. Удаляем локальные файлы, которых нет в remote manifest (с учётом GC TTL)

**Совместимость с PouchDB snapshot:** при импорте старого snapshot, который содержит inline base64 файлы:

1. Детектируем формат по наличию `_attachments` в документах
2. Декодируем base64 → пишем в `assets/`
3. Создаём записи в `files` таблице

### Преимущества

| Аспект                       | PouchDB (base64 в документе)         | Disk-based                          |
| ---------------------------- | ------------------------------------ | ----------------------------------- |
| Размер БД (100 файлов × 1MB) | ~133MB                               | ~0.1MB (только метаданные)          |
| Размер snapshot              | ~133MB                               | ~0.05MB (JSON без бинарных данных)  |
| Чтение файла                 | deserialize doc + base64 decode      | `fs.createReadStream` (zero-copy)   |
| Запись файла                 | base64 encode + serialize doc        | `fs.writeFile`                      |
| Sync время                   | линейно от суммарного размера файлов | инкрементально (только новые файлы) |
| Orphan cleanup               | JS scan всех задач + контента        | `readdir` + SQL query               |
| Память при чтении            | весь файл в буфере                   | стриминг                            |

---

## Архитектурное решение

### Принцип: замена только persistence layer

```
StorageController (Facade) — БЕЗ ИЗМЕНЕНИЙ (интерфейс)
    ↓
Services Layer — минимальные изменения (убрать hydration, упростить каскады)
    ↓
Models Layer — ПЕРЕПИСАТЬ (PouchDB → SQL-запросы)
    ↓
Mappers Layer — УПРОСТИТЬ (убрать doc ID prefixes, убрать _rev)
    ↓
SQLite (better-sqlite3) — НОВЫЙ persistence
```

### Что НЕ меняется

- `IStorageController` интерфейс (30+ методов)
- Все IPC handlers (`src/main/setup/ipc/storage.ts`)
- Preload bridge и renderer API
- Domain типы (`Task`, `Day`, `Tag`, `Branch`, `File`)
- Search index (остаётся in-memory, инициализируется из SQLite)
- Custom protocol `daily://file/{id}`

### Что упрощается

- **Tag hydration исчезает из сервисов** — `getDays` делает JOIN в SQL
- **`withRetryOnConflict` удаляется** — заменяется транзакциями
- **Маппер `docIdMap` удаляется** — нет ID-префиксов
- **TTL-кэши в TagModel/BranchModel** — не нужны, SQLite и так быстрый
- **`groupTasksByDay`** — заменяется SQL GROUP BY / оконными функциями
- **Tag cascade delete** — `ON DELETE CASCADE` в `task_tags` + один UPDATE

### Ключевые SQL-запросы

**getDays (range + branch):**

```sql
SELECT
  t.id, t.status, t.content, t.minimized, t.order_index,
  t.scheduled_date, t.scheduled_time, t.scheduled_timezone,
  t.estimated_time, t.spent_time, t.branch_id,
  t.created_at, t.updated_at, t.deleted_at,
  -- tags as JSON array
  (SELECT json_group_array(json_object('id', tg.id, 'name', tg.name, 'color', tg.color,
    'createdAt', tg.created_at, 'updatedAt', tg.updated_at, 'deletedAt', tg.deleted_at))
   FROM task_tags tt JOIN tags tg ON tt.tag_id = tg.id AND tg.deleted_at IS NULL
   WHERE tt.task_id = t.id) AS tags_json,
  -- attachments as JSON array
  (SELECT json_group_array(f.id)
   FROM task_attachments ta JOIN files f ON ta.file_id = f.id
   WHERE ta.task_id = t.id) AS attachments_json
FROM tasks t
WHERE t.branch_id = ?
  AND t.scheduled_date BETWEEN ? AND ?
  AND t.deleted_at IS NULL
ORDER BY t.scheduled_date, t.order_index;
```

Результат группируется в `Day[]` одним проходом по результату (O(N)).

**moveTaskByOrder (reorder в транзакции):**

```sql
BEGIN;
UPDATE tasks SET order_index = ?, status = ?, updated_at = ? WHERE id = ?;
-- при необходимости нормализации:
-- UPDATE tasks SET order_index = (ROW_NUMBER ...) WHERE scheduled_date = ? AND branch_id = ?;
COMMIT;
```

**deleteTag (cascade):**

```sql
BEGIN;
DELETE FROM task_tags WHERE tag_id = ?;
UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?;
COMMIT;
```

---

## Проблемы текущего iCloud sync и их решение в рамках миграции

### Аудит текущей реализации

Текущий sync построен по модели "remote flash drive": iCloud Drive используется как тупое файловое хранилище, вся логика живёт локально. При каждом sync-цикле (каждые 5 минут) происходит:

1. Полная загрузка всех документов из PouchDB (включая base64-файлы) в память
2. Вычисление SHA-256 хеша и сравнение с remote
3. При расхождении — LWW merge + полная перезапись `snapshot.json`

При анализе выявлены следующие проблемы:

### Проблема 1: Нет `NSFileCoordinator` (критично)

iCloud Drive на macOS требует `NSFileCoordinator` для безопасного конкурентного доступа к облачным файлам. Сейчас используется голый `fs.readFile` / `fs.writeFile`. Последствия:

- **Частичное чтение**: если iCloud активно загружает `snapshot.json` на сервер, `fs.readFile` может получить неполный файл → `JSON.parse` падает → sync считает remote пустым → **пушит локальный стейт поверх более нового remote**
- **Silent overwrite**: если два Mac'а одновременно пишут snapshot — один тихо перезапишет другой на уровне FS, минуя LWW
- **`.icloud` placeholder**: когда файл evicted из локального кэша iCloud, на диске остаётся `.snapshot.json.icloud` stub. `fs.readFile("snapshot.json")` вернёт ENOENT → app решит что remote пуст → перезапишет

**Решение в рамках миграции:**

Используем `@aspect-build/napi-file-coordinator` (Node.js binding для `NSFileCoordinator`) или вызов через Electron native module. Оборачиваем все операции с iCloud-директорией:

```ts
// Чтение с координацией
async function coordinatedRead(path: string): Promise<Buffer | null> {
  return fileCoordinator.coordinateReading(path, async (resolvedPath) => {
    return fs.readFile(resolvedPath)
  })
}

// Запись с координацией
async function coordinatedWrite(path: string, data: Buffer): Promise<void> {
  return fileCoordinator.coordinateWriting(path, async (resolvedPath) => {
    // atomic write: пишем во временный файл, затем rename
    const tmp = resolvedPath + ".tmp"
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, resolvedPath)
  })
}
```

Дополнительно: обработка `.icloud` stub-файлов. Перед чтением проверяем наличие placeholder и инициируем скачивание через `NSFileManager.startDownloadingUbiquitousItem`.

**Если нативный binding невозможен** (сложность, поддержка): минимальная защита — atomic write через temp file + rename (атомарен на APFS), retry при ошибке чтения с exponential backoff, проверка целостности JSON после parse.

### Проблема 2: Snapshot всегда полный (решается disk-based files)

Каждый sync-цикл сериализует ВСЕ данные включая base64 файлов в один `snapshot.json`. Одна картинка 5MB = +6.7MB к каждому snapshot write.

**Решается миграцией на disk-based файлы** (описано выше):

- Snapshot v2 содержит только structured data + file manifest
- Файлы синхронизируются отдельно через `sync/assets/` — инкрементально
- Snapshot остаётся компактным (< 1MB даже при тысячах задач)

### Проблема 3: Нет mutex на `_sync()` (значительно)

`AsyncMutex` реализован в проекте, но **не используется в sync path**. Ручной `forceSync()` через IPC может запуститься параллельно с автоматическим 5-минутным циклом. Оба прочитают один remote snapshot, оба смержат, оба запишут — второй перезапишет первого.

**Решение**: обернуть `SyncEngine._sync()` в `AsyncMutex`. Если sync уже выполняется, повторный вызов ждёт завершения текущего.

```ts
class SyncEngine {
  private mutex = new AsyncMutex()

  async sync(strategy: MergeStrategy = "pull") {
    await this.mutex.run(() => this._sync(strategy))
  }
}
```

### Проблема 4: Settings tie-break инвертирован (умеренно)

`mergeSettings` — local wins on tie (`isNewerOrEqual`). `mergeCollections` с strategy `"pull"` — remote wins on tie. При одновременном редактировании настроек на двух устройствах поведение непредсказуемо.

**Решение**: унифицировать tie-break. При `"pull"` стратегии remote всегда побеждает на tie — для всех коллекций, включая settings.

### Проблема 5: iCloud path захардкожен

```ts
;`${process.env.HOME}/Library/Mobile Documents/com~apple~CloudDocs`
```

Используется `process.env.HOME` вместо `app.getPath("home")`. Папка `Daily/` создаётся в корне iCloud Drive и видна пользователю в Finder.

**Решение**: использовать `app.getPath("home")` через Electron API. Расположение папки оставить в корне iCloud Drive — это нормально для пользовательского приложения, и пользователь может видеть свои данные.

### Что решается миграцией, а что нет

| Проблема                    | Решается? | Как                                                                        |
| --------------------------- | --------- | -------------------------------------------------------------------------- |
| Нет `NSFileCoordinator`     | Частично  | Atomic write + retry. Полное решение — отдельная задача с нативным модулем |
| Полный snapshot с файлами   | Да        | Disk-based files + snapshot v2 без бинарных данных                         |
| Нет mutex на sync           | Да        | `AsyncMutex` вокруг `_sync()`                                              |
| Settings tie-break          | Да        | Унификация при переписывании merge logic                                   |
| Захардкоженный path         | Да        | `app.getPath("home")` при рефакторе config                                 |
| Hash игнорирует attachments | Да        | Не актуально — файлы больше не в snapshot                                  |

---

## План работ

### Phase 0: Подготовка инфраструктуры

- Добавить `better-sqlite3` dependency + electron-builder native module config
- Создать `src/main/storage/sqlite/database.ts` — инициализация, создание таблиц, WAL mode, `PRAGMA foreign_keys = ON`
- Создать систему миграций: `src/main/storage/sqlite/migrations/` с версионированными SQL-файлами
- Настроить путь БД: `~/Library/Application Support/Daily/db/daily.sqlite`

Deliverables:

- SQLite БД создаётся при запуске
- Таблицы и индексы создаются через миграцию v001

### Phase 1: Модели на SQLite

Переписать все модели с PouchDB API на SQL-запросы:

- `TaskModel` → prepared statements для CRUD, range queries, soft/permanent delete
- `TagModel` → без TTL-кэша, прямые запросы
- `BranchModel` → без TTL-кэша, `ensureMainBranch` через `INSERT OR IGNORE`
- `FileModel` → метаданные в SQL, бинарные данные на диске (`assets/`)
- `SettingsModel` → без AsyncMutex (SQLite serializes writes), `INSERT OR REPLACE`

Deliverables:

- Все модели работают через SQLite
- Маппинг `row → domain model` вместо `doc → domain model`

### Phase 2: Упрощение сервисов

- `DaysService.getDays` — один SQL-запрос с JOIN вместо `getTaskList + getTagList + hydrate + groupByDay`
- `DaysService.getDay` — тот же запрос с `WHERE date = ?`
- `TasksService` — убрать tag hydration из всех методов, убрать `withRetryOnConflict`, использовать транзакции
- `TagsService.deleteTag` — `DELETE FROM task_tags` вместо загрузки всех задач
- `FilesService` — адаптировать: запись файлов на диск (`assets/`), стриминг через `fs.createReadStream`, orphan cleanup через `readdir` + SQL
- `SearchService` — без изменений (загружает все задачи при старте)

Deliverables:

- Сервисный слой упрощён, tag hydration убрана
- Все операции в транзакциях

### Phase 3: Миграция данных PouchDB → SQLite

- One-time migration script при первом запуске новой версии:
  1. Проверить наличие PouchDB (`~/Library/Application Support/Daily/db/`)
  2. Если SQLite пуста + PouchDB существует → запустить миграцию
  3. `db.allDocs({include_docs: true, attachments: true})` — прочитать все документы
  4. Распределить по таблицам: tasks, tags, branches, files, settings, task_tags, task_attachments
  5. Конвертировать ID (убрать префиксы `task:`, `tag:`, etc.)
  6. Конвертировать `tags: string[]` → записи в `task_tags`
  7. Конвертировать `attachments: string[]` → записи в `task_attachments`
  8. Конвертировать `_attachments.data` (base64) → файлы на диске в `assets/{id}.{ext}`
  9. Пропустить документы с `deletedAt = epoch` (permanent deleted)
  10. После успешной миграции — пометить флагом (не удалять PouchDB сразу)

- Fallback: если миграция упала — откат, приложение работает на PouchDB

Deliverables:

- Автоматическая миграция при обновлении
- Данные пользователя сохранены
- PouchDB не удаляется до подтверждения стабильности

### Phase 4: Адаптация Sync + исправление существующих проблем

**Переход на SQLite backend:**

- `LocalStorageAdapter` — читать/писать из SQLite вместо PouchDB
- Snapshot формат v2: JSON содержит только structured data + file manifest (без бинарных данных)
- Файлы синхронизируются отдельно через `sync/assets/` — инкрементально (только новые/изменённые)
- При экспорте: SQL SELECT → snapshot JSON + копирование новых файлов в `sync/assets/`
- При импорте: merge structured data + копирование недостающих файлов из `sync/assets/` в `assets/`
- GC: `DELETE FROM tasks WHERE deleted_at < ?` + `fs.unlink` для orphan файлов
- Обратная совместимость: при импорте PouchDB snapshot (v1 с inline base64) — декодировать файлы на диск

**Исправление проблем iCloud sync:**

- Обернуть `SyncEngine._sync()` в `AsyncMutex` — исключить параллельные sync-циклы
- Atomic write для snapshot: запись во временный файл + `fs.rename` (атомарен на APFS)
- Retry с exponential backoff при ошибке чтения snapshot (защита от частичного файла во время iCloud upload)
- Валидация JSON после parse: если snapshot повреждён — не перезаписывать remote, логировать ошибку
- Обработка `.icloud` placeholder: проверка наличия stub-файла перед чтением
- Унифицировать settings tie-break: remote wins on tie при pull-стратегии (как и остальные коллекции)
- Заменить `process.env.HOME` на `app.getPath("home")` при формировании iCloud path
- Убрать `withRetryOnConflict` из sync adapter (не нужен с SQLite транзакциями)

Deliverables:

- iCloud sync работает с SQLite backend
- Snapshot чистый и компактный (только JSON, без бинарных данных)
- Файлы синхронизируются инкрементально
- Совместимость со старыми snapshot'ами (PouchDB-формат читается и мигрируется)
- Нет race condition между manual и scheduled sync
- Atomic writes защищают от corrupted snapshot
- Settings merge ведёт себя консистентно с остальными коллекциями

### Phase 5: Очистка и удаление PouchDB

- Удалить `pouchdb`, `pouchdb-find` dependencies
- Удалить `src/main/storage/database.ts` (PouchDB init)
- Удалить `src/main/storage/models/_mappers.ts` (doc ID prefix logic)
- Удалить `src/main/utils/withRetryOnConflict.ts`
- Удалить `createCacheLoader` утилиту (TTL-кэши не нужны)
- Удалить скрипты `db:inspect`, `db:export`, `db:clear` или адаптировать под SQLite
- Обновить `electron-builder` config (убрать native PouchDB modules если были)

Deliverables:

- PouchDB полностью удалён из проекта
- Размер бандла уменьшен
- CLI-утилиты работают с SQLite

### Phase 6: Стабилизация

- Smoke-тесты всех IPC endpoints
- Проверка edge cases: пустая БД, миграция с 0 задач, миграция с 5000 задач
- Проверка sync: PouchDB snapshot → SQLite import, SQLite → SQLite sync
- Перформанс-замеры: сравнение baseline (PouchDB) vs after (SQLite)
- Проверка custom protocol `daily://file/{id}` со стримингом файлов с диска
- Проверка orphan cleanup: удалённые файлы, файлы без записей в БД, файлы в sync/assets без local reference

Deliverables:

- Все сценарии работают стабильно
- Метрики after >= target

---

## Структура файлов

| Файл                                                     | Действие                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/main/storage/sqlite/database.ts`                    | Новый: инициализация SQLite, WAL, pragmas                              |
| `src/main/storage/sqlite/migrations/`                    | Новый: версионированные SQL-миграции                                   |
| `src/main/storage/sqlite/migrate.ts`                     | Новый: migration runner                                                |
| `src/main/storage/models/TaskModel.ts`                   | Переписать: PouchDB → SQL prepared statements                          |
| `src/main/storage/models/TagModel.ts`                    | Переписать: убрать кэш, SQL-запросы                                    |
| `src/main/storage/models/BranchModel.ts`                 | Переписать: убрать кэш, SQL-запросы                                    |
| `src/main/storage/models/FileModel.ts`                   | Переписать: метаданные в SQL, файлы на диске                           |
| `src/main/storage/models/SettingsModel.ts`               | Переписать: убрать mutex, SQL-запросы                                  |
| `src/main/storage/models/_mappers.ts`                    | Удалить (заменить простыми row mappers)                                |
| `src/main/storage/services/DaysService.ts`               | Упростить: один SQL JOIN вместо hydration                              |
| `src/main/storage/services/TasksService.ts`              | Упростить: убрать hydration, транзакции                                |
| `src/main/storage/services/TagsService.ts`               | Упростить: cascade через SQL                                           |
| `src/main/storage/services/FilesService.ts`              | Переписать: disk-based file storage + streaming                        |
| `src/main/storage/StorageController.ts`                  | Минимально: init SQLite вместо PouchDB                                 |
| `src/main/storage/sync/SyncEngine.ts`                    | Исправить: добавить AsyncMutex, atomic write                           |
| `src/main/storage/sync/adapters/LocalStorageAdapter.ts`  | Переписать: SQL read/write для sync                                    |
| `src/main/storage/sync/adapters/RemoteStorageAdapter.ts` | Исправить: atomic write, retry, .icloud handling                       |
| `src/main/utils/sync/merge/mergeSettings.ts`             | Исправить: унифицировать tie-break с mergeCollections                  |
| `src/main/config.ts`                                     | Исправить: `app.getPath("home")` вместо `process.env.HOME`             |
| `src/main/storage/database.ts`                           | Удалить (PouchDB init)                                                 |
| `src/main/utils/withRetryOnConflict.ts`                  | Удалить                                                                |
| `src/main/storage/migration/pouchdb-to-sqlite.ts`        | Новый: one-time data migration                                         |
| `src/main/storage/assets.ts`                             | Новый: disk-based file I/O (save, read stream, delete, orphan cleanup) |
| `package.json`                                           | Добавить `better-sqlite3`, удалить `pouchdb*`                          |

---

## Риски и меры

- **Риск**: потеря данных при миграции
  - Мера: PouchDB не удаляется после миграции, rollback при ошибке, бэкап перед миграцией
- **Риск**: `better-sqlite3` нативный модуль — проблемы с electron-builder
  - Мера: проверить `electron-rebuild`, добавить в `electron-builder` `externals`
- **Риск**: sync snapshot несовместимость между PouchDB и SQLite версиями
  - Мера: snapshot формат остаётся JSON, обе версии читают одинаковый формат
- **Риск**: файлы на диске могут рассинхронизироваться с записями в БД
  - Мера: orphan cleanup при старте (readdir + SQL diff), файлы без записи в БД удаляются после TTL
- **Риск**: iCloud sync конфликт при одновременном редактировании с двух машин (файлы)
  - Мера: файлы иммутабельны (ID = nanoid), конфликтов записи не бывает — только добавление/удаление
- **Риск**: corrupted snapshot при сбое во время записи
  - Мера: atomic write (temp file + rename), валидация JSON после parse, не перезаписывать remote при ошибке чтения
- **Риск**: `.icloud` placeholder не обработан — app считает remote пустым и пушит поверх
  - Мера: детекция stub-файлов, инициирование скачивания, retry с backoff
- **Риск**: регрессия в UI из-за изменения порядка/формата данных
  - Мера: IPC контракт не меняется, domain типы не меняются — renderer не затронут

## Критерии приёмки

- Все IPC endpoints возвращают данные в том же формате что и с PouchDB
- Миграция с PouchDB проходит без потери данных (задачи, теги, файлы, настройки)
- iCloud sync работает между SQLite-версиями и совместим с PouchDB-snapshot'ами
- Custom protocol `daily://file/{id}` стримит файлы с диска
- Файлы хранятся в `assets/` отдельно от БД, sync snapshot не содержит бинарных данных
- `pnpm lint` проходит, PouchDB dependencies удалены
- Concurrent sync вызовы (manual + scheduled) не приводят к race condition
- Corrupted/partial snapshot не перезаписывает remote
- Перформанс: `getDays` < 20 мс, `getDay` < 5 мс на 1000 задач
