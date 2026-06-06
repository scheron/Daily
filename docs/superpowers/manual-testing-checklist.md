# Manual testing checklist — `feat/agentic` branch

> Перед merge обязательно пройти весь этот документ на работающем приложении.
> Все автоматические тесты зелёные (`pnpm test` → 483 passed), но многое из ниже-описанного не покрывается unit-тестами: настоящий LLM, IPC до окна, persistence в SQLite, UI confirmation card.

## Подготовка

- [ ] `pnpm dev` запускается без ошибок (нет красных в DevTools главного окна и Assistant окна).
- [ ] В `~/Library/Application Support/Daily/db/daily.sqlite` после первого запуска появились новые таблицы:
  ```bash
  sqlite3 ~/Library/Application\ Support/Daily/db/daily.sqlite ".tables"
  # Должны быть: ai_sessions, ai_turns, ai_steps  (новые)
  #             + existing: branches, tags, tasks, ...
  ```
- [ ] В AI Settings → провайдер OpenAI (или совместимый), модель работает с `tool_choice: "required"` (GPT-4o, GPT-4.1, Claude через прокси с поддержкой tool_choice).
  - **Если используется local llama.cpp** — пометить отдельно: `tool_choice: "required"` может игнорироваться, тогда сработает fallback на plain content (см. ниже).

---

## Phase 3 — Tool-call policy & confirmations

### Базовая destructive-tool confirmation

- [ ] В чате: «удали задачу X» (где X существует).
  - [ ] Сначала ассистент должен вызвать `list_tasks` / `search_tasks` для поиска ID.
  - [ ] Затем появляется **confirmation card** с заголовком «Delete task», описанием и кнопками _Confirm_ / _Cancel_.
  - [ ] _Confirm_ → задача переезжает в trash, ассистент сообщает об этом через `respond`.
  - [ ] Повторить тот же сценарий, но _Cancel_ → задача НЕ удалена, ассистент тоже это подтверждает.

### Permanent delete — отдельный заголовок

- [ ] В чате: «безвозвратно удали задачу X» (предварительно положить задачу в trash).
  - [ ] Заголовок confirmation card содержит слово «Permanent» / «навсегда».
  - [ ] Текст summary упоминает, что это нельзя отменить.

### Timeout confirmation

- [ ] Запустить destructive-операцию, оставить карточку висеть **60 секунд без клика**.
  - [ ] Через ~60 сек карточка автоматически закрывается (как если бы нажали Cancel).
  - [ ] Ассистент возвращается с сообщением о том, что операция не выполнена.

### Сброс confirmation на cancel

- [ ] Запустить destructive-операцию → дождаться карточки → нажать кнопку **Cancel request** в шапке Assistant (не _Cancel_ на карточке, а глобальный cancel).
  - [ ] Карточка confirmation исчезает.
  - [ ] Ассистент возвращает «Request cancelled».
  - [ ] Следующий запрос работает нормально.

### Concurrent send

- [ ] Отправить сообщение → пока «thinking…» — попытаться отправить второе.
  - [ ] Второе должно быть отклонено с понятной ошибкой («already processing» или похожее).

### Read-only tools НЕ требуют подтверждения

- [ ] «покажи задачи на сегодня» — никаких confirmation cards быть не должно.
- [ ] «найди задачи со словом "встреча"» — то же.

---

## Phase 4 — Turn Model + `respond` tool + `tool_choice: required`

### Respond используется как канал ответа

- [ ] Любой простой запрос → в логах main процесса (`pnpm dev` консоль) увидеть запись о `tool_choice` = `"required"` (тыкнуть DevTools → Console если запросы видны).
- [ ] Ответ в чате — именно то, что модель передала в `respond({text})`.
  - [ ] Особенно проверить: НЕТ «`<think>`» блоков, нет ReAct «Thought:/Action:» меток.

### Plain-content fallback (для несоответствующих моделей)

- [ ] Если используется local-модель, которая игнорирует `tool_choice` — убедиться, что чат не падает: model вернёт plain content → он окажется в ответе как fallback. Контент не должен быть пустым.

### Никакие read tools НЕ просят confirmation

- [ ] См. выше «Read-only tools».

### Multi-step выполнение

- [ ] «создай задачу "купить молоко" завтра в 17:00» → ассистент должен вызвать `create_task`, потом `respond` с результатом.
- [ ] «I spent 45 minutes on the report task» → ассистент: `list_tasks` или `search_tasks` → `log_time` → `respond`.

---

## Phase 5 — Durable AI Sessions

### Persistence работает

- [ ] Отправить 2-3 сообщения в чат, дождаться ответов.
- [ ] Закрыть приложение полностью (Cmd+Q), снова открыть.
- [ ] Открыть Assistant окно — **последняя сессия должна восстановиться**: видны прошлые user/assistant пары и хвостики со списком инструментов.
- [ ] Проверить в БД, что строки появились:
  ```bash
  sqlite3 ~/Library/Application\ Support/Daily/db/daily.sqlite "SELECT COUNT(*) FROM ai_turns; SELECT COUNT(*) FROM ai_steps;"
  ```

### Clear history архивирует сессию

- [ ] Нажать «Clear history» в Assistant.
- [ ] Чат опустошается.
- [ ] В БД: предыдущая сессия должна быть archived (`SELECT id, status, archived_at FROM ai_sessions ORDER BY created_at DESC`).
- [ ] Отправить новое сообщение — создаётся новая сессия.

### Persistence на failed/cancelled turns

- [ ] Запустить операцию и отменить её (Cancel request). Turn должен записаться с `status='cancelled'`:
  ```bash
  sqlite3 ~/Library/Application\ Support/Daily/db/daily.sqlite "SELECT id, status, error FROM ai_turns ORDER BY started_at DESC LIMIT 5;"
  ```
- [ ] Спровоцировать ошибку (например, отключить интернет → отправить сообщение). Turn пишется с `status='failed'` и `error` колонкой.

### Restore только последних 20

- [ ] Если в сессии >20 turns — после рестарта в чате видны только последние 20. Это by design.

---

## Phase 6 — Structured Tool Results

### `changedEntities` доходит до compactor/persistence

- [ ] Создать через ассистента несколько задач подряд. Открыть SQLite:
  ```sql
  SELECT payload_json FROM ai_steps WHERE type='tool_result' ORDER BY created_at DESC LIMIT 5;
  ```
  В каждом `payload_json` для write-tools должен быть массив `changedEntities` с записями вида `{"type":"task","id":"...","action":"created"}`.

### Старые data-строки по-прежнему отображаются

- [ ] В чате ниже ответа ассистента развернуть «N tools used» — каждая строка должна показывать summary в формате `«Task created: ...»` / `«Task moved to trash: ...»`. Это backwards-compat: formatter выбирает `summary ?? data-string`.

---

## Phase 7 — Live event stream

> Видимого UI пока нет — канал просто проложен. Проверить можно только из DevTools.

- [ ] Открыть DevTools Assistant окна → Console → выполнить:
  ```js
  window.BridgeIPC["ai:on-event"]((e) => console.log("AI EVENT", e))
  ```
- [ ] Отправить любое сообщение. В консоли должна появиться лента событий:
  - `turn_started`
  - `model_requested` → `model_responded`
  - (если был tool) `tool_started` → `tool_finished`
  - `turn_finished` (или `turn_failed`/`turn_cancelled`)
- [ ] Тулевые события содержат `toolName`, но НЕ параметры. Это намеренно (приватность логов).

---

## Phase 8 — Conversation compaction

### Compaction срабатывает при длинной истории

- [ ] Отправить много (>10) сообщений подряд, чтобы `conversationHistory` превысил порог в **30 messages** (примерно 8-10 turns с write tools).
- [ ] В DevTools main процесса найти debug-лог «Prepared LLM messages» — `count` должен сократиться (есть system + summary + последние ~16 messages).
- [ ] Сам ассистент должен по-прежнему «помнить» что было раньше — например, спросить «что я просил сегодня?» — и получить корректный пересказ. Это работает за счёт summary message, заинъекченного compactor'ом.

### Compactor refresh после persistence

- [ ] После каждого turn должна быть синхронизация. Никаких видимых артефактов — просто работает.

### Compactor не ломается при чистой истории

- [ ] После «Clear history» → новый turn → compactor пустой → splice не должен ничего ломать.

---

## Phase 9 — Eval harness

> Это автоматизация, не ручная проверка. Но проверьте, что:

- [ ] `pnpm evitest run tests/main/ai/evals/` → 4 файла, 8 тестов, все зелёные.
- [ ] Тесты можно копировать как шаблон — структура `tests/main/ai/evals/*.eval.test.ts` + хелперы в `tests/main/ai/helpers/`.

---

## Phase 10 — Prompt + logging cleanup

### Системный промпт чище

- [ ] Открыть `src/main/ai/promts/getSystemPrompt.ts` — НЕТ строки «Ask confirmation before destructive operations». Вместо неё короткий note: «destructive tools trigger a runtime confirmation card».
- [ ] Промпты compact/tiny — то же.

### Redaction в логах

- [ ] В debug-логах AIController/ToolExecutor НЕ должно быть полных текстов user-сообщений или параметров tool-вызовов.
- [ ] Должны быть только: имена tools, число сообщений, длины полей, ключи параметров.
- [ ] Проверить в `main` процесс логе:
  ```
  Tool call: create_task { toolName: "create_task", paramKeys: ["content", "date", "time"] }
  ```
  Никаких `content: "buy milk"` в дефолтном debug.

---

## Cross-phase: end-to-end smoke сценарии

Запустить эти 4 сценария от начала до конца, наблюдая за UI И за SQLite:

### 1. Создать задачу, посмотреть её, удалить с подтверждением

- [ ] «создай задачу "test phase X" завтра в 10:00» → success
- [ ] «покажи задачи на завтра» → видна созданная
- [ ] «удали задачу test phase X» → confirmation card → confirm → задача в trash
- [ ] «восстанови задачу test phase X» → success

### 2. Создать тег, навесить, удалить тег

- [ ] «создай тег Work зелёного цвета» → tag создан
- [ ] «навесь тег Work на сегодняшнюю задачу X» → discovery (list_tasks/list_tags) → assign
- [ ] «удали тег Work» → confirmation card (destructive!) → confirm → удалено + снято со всех задач

### 3. Проект switch + перенос задачи

- [ ] «создай проект Personal» → success
- [ ] «переключись на проект Personal» → success
- [ ] «перенеси задачу X в проект main» → success

### 4. Длинный диалог + рестарт + продолжение

- [ ] Сделать 5-7 turn-ов на разные темы.
- [ ] Cmd+Q → перезапустить.
- [ ] В Assistant окне видна вся история (или последние 20).
- [ ] Задать вопрос «о чём мы говорили?» → ассистент даёт связный ответ (compactor работает).
- [ ] «Clear history» → пусто. Старая сессия в БД с `archived_at IS NOT NULL`.

---

## Регрессии (что НЕ должно сломаться)

- [ ] MCP сервер: external client (Claude Desktop etc) может вызывать `create_task`, `list_tasks`, и т.д.
- [ ] MCP сервер: external client НЕ видит `respond` инструмент (он скрыт).
- [ ] MCP сервер: external client НЕ может вызвать `permanently_delete_task`, `delete_project`, `delete_tag`, `remove_task_attachment` (они в BLOCKED).
- [ ] iCloud sync продолжает работать (если включён) — миграция v004 не задела `tasks/tags/branches`.
- [ ] Локальные модели (если используются): `LocalAiClient.checkConnection()` запускает llama-server, модель отвечает.

---

## Известные ограничения (не баги, документировать)

- **Tool-choice required + local llama.cpp**: не все билды llama.cpp уважают параметр. Если модель упорно возвращает plain content — fallback в ответ сработает, но `respond`-протокола в строгом смысле не будет. Это документированное degraded поведение.
- **Restore чата**: показывает только последние 20 turns. Если хочется больше — увеличить лимит в `AIController.getCurrentSession()`.
- **Compaction**: summary дёшев и детерминистский, но он не использует LLM. Для очень длинных сессий смысл уменьшается. Это by design — LLM-summary можно добавить как Phase 8.5 если понадобится.
- **AI Events**: канал проложен, но renderer ещё не отрисовывает live status (Phase 7 — backend-only). Можно добавить позже.
- **Sessions list UI**: одна активная сессия. Просмотр архивных через UI пока нет — только из БД.

---

## Что делать если что-то сломалось

1. **Confirmation card не появляется** → проверить, что инструмент действительно `isDestructive: true` в `src/main/ai/tools/registry/categories/`.
2. **«AI session created» в логах, но в БД пусто** → миграция v004 не накатилась. Сделать `pnpm dev` → миграции idempotent, накатятся при следующем запуске.
3. **Чат не восстанавливается после рестарта** → проверить DevTools Assistant — IPC ошибка? Skip-условие (`messages.length > 0`)? см. `src/renderer/src/stores/ai/ai.store.ts:hydrateFromActiveSession`.
4. **Tool_choice: required не работает** → в `OpenAiCompatibleClient.chat` посмотреть `requestBody.tool_choice` в логе debug. Может, провайдер не поддерживает — degraded fallback должен сработать.
5. **`pnpm test` падает** → перед merge ОБЯЗАТЕЛЬНО починить. На момент написания было 483/483 green.

---

## После прохождения чек-листа

- [ ] `pnpm lint && pnpm typecheck:all && pnpm test && pnpm circular` — последняя проверка.
- [ ] Squash или semantic-история — на усмотрение.
- [ ] PR в main + merge.
- [ ] Удалить ветку `feat/agentic` после merge.
