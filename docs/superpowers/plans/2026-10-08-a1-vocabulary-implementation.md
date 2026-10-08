# Числа 0–20 и словарь A1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить девять частей речи, импорт 21 числа и 300 карточек A1 с сохранением пользовательских данных.

**Architecture:** Сначала расширить словарь и схему 6 → 7, затем импорт и формат backup 3. Учебные CSV поставляются файлами; автоматического наполнения всех профилей нет. Этот этап самостоятельно проверяется до расширения грамматики.

**Tech Stack:** React Native, Expo SQLite, TypeScript, Jest, React Native Testing Library, Maestro.

**Spec:** [Согласованная спецификация](../specs/2026-10-08-a1-vocabulary-numbers-design.md); [задания и ответы](../specs/2026-10-08-lektion-2-exercise-content.md).

## Global Constraints

- React Native 0.85.3, React 19.2.3, Expo 56, TypeScript, SQLite; полностью офлайн, без новых сетевых зависимостей.
- Свой словарь и прогресс каждого профиля; package `com.personal.germanvocabulary`, существующий ключ подписи. Не очищать данные телефона.
- 20 правильных подряд; ошибка сбрасывает только незавершённую первичную серию. Повторения: 1, 3, 7, 14, 30, 60 дней; ошибка после освоения назначает завтра.
- 3 ошибки отмечают трудную цель, 3 правильных подряд снимают отметку; +10 XP за ответ, +50 XP за первое освоение однократно; уровень каждые 500 XP.
- Кнопки грамматики содержат только немецкие ответы. Контекст на русском допустим; решение и перевод показываются после ответа.
- Рабочая ветка `question-screen-ux`; основной checkout с посторонними изменениями не трогать. Сохранить прежние идентификаторы, сессии, историю и награды.
- Каждый программный шаг: RED → подтверждение ожидаемого падения → минимальная реализация → GREEN → коммит только своих файлов. Ошибка окружения не считается RED.

## Review Focus

- Ошибка пересоздания таблицы не оставляет foreign_keys выключенным и не теряет дочерние записи — задача V1.
- Один и тот же CSV-ключ в двух темах должен включить слово в обе темы — V2.
- Смена профиля A → B → A после предпросмотра не разрешает старый импорт — V2.
- Буквы Sie, NFC/NFD и кавычки в примерах проходят CSV/backup без потери — V3/V5.
- Мало вариантов для чисел и отсутствие немецкого офлайн-голоса не блокируют занятие — V4.

---

### V1. Типы слов и безопасная миграция 6 → 7

**Files:** создать `src/features/dictionary/wordParts.ts`, `src/core/migrations/007_word_parts.ts`, `test/integration/wordPartsMigration.test.ts`; изменить `src/core/sql.ts`, `src/core/migrations.ts`, `src/features/learning/learningTypes.ts`, `src/features/dictionary/wordValidation.ts`, `test/sqlite.ts`, `test/integration/sql.test.ts`, `test/integration/words.test.ts`.

**Interfaces:** `wordParts` — readonly массив девяти `{value,labelRu}` из спецификации; `WordPart` — union этих value; `Word.pos: WordPart`. `SqlStore.schemaTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>` — только для пересоздания таблиц при старте. `migrateWordParts(tx: SqlExecutor): Promise<void>`. Существующие `validateWord(draft: WordDraft): WordDraft`, `wordKey` сохраняют сигнатуры.

- [ ] Добавить тесты `all_nine_parts_and_noun_only_gender_plural`, `migration_preserves_v6_graph`, `schema_transaction_rolls_back_and_restores_foreign_keys`, `queued_operations_wait_for_schema_transaction`. Проверить все девять типов; неизвестный тип отвергается; noun без рода отвергается; non-noun с родом/plural отвергается; `Sie` сохраняется; старые ключи не меняются. Снимок всех таблиц v6 с двумя профилями, ненулевым XP, наградой, активными словарной и грамматической сессиями сравнить после миграции, исключая только user_version и SQL-описание words. Проверить повторный старт и ошибку после переноса данных.
- [ ] Выполнить `npm test -- --runInBand --runTestsByPath test/integration/sql.test.ts test/integration/words.test.ts test/integration/wordPartsMigration.test.ts`; подтвердить падение новых assertions.
- [ ] Реализовать каталог и валидацию. Не менять `wordKey` и нормализацию существительных; нейтральное представление для всех non-noun. Не переписывать старые данные ради нового ограничения: если входные данные несовместимы, миграция откатывается с понятной ошибкой.
- [ ] Реализовать `schemaTransaction` внутри той же очереди `createSqlStore`: на основном native-соединении сохранить PRAGMA, выключить foreign_keys **до** `BEGIN IMMEDIATE`, выполнить callback через direct executor, проверить `foreign_key_check`, затем COMMIT; при ошибке ROLLBACK, в finally восстановить foreign_keys и проверить значение. Не использовать `withExclusiveTransactionAsync` для этой операции: он создаёт другое соединение после BEGIN. Обычный `transaction` оставить с существующей проверкой FK. Повторить контракт в Node-адаптере `test/sqlite.ts`; не допускать вложенных вызовов db из callback.
- [ ] Реализовать пересоздание words с прежними столбцами/индексами и новым CHECK частей речи. Старые миграции 1–6 завершить обычной транзакцией; 7 запускать отдельно через schemaTransaction; user_version=7 выставлять в той же транзакции после проверки связей. Более новую неподдерживаемую схему отвергать до изменений.
- [ ] Повторить целевые тесты и `npm run typecheck`; PASS. Закоммитить перечисленные изменённые файлы: `feat: support extended word parts with safe schema migration`.

### V2. CSV и включение точных дублей в темы

**Files:** изменить `src/features/transfer/csvParser.ts`, `csvImportService.ts`, `TransferScreen.tsx` в той же директории; `src/features/topics/topicRepository.ts` только при необходимости нового helper; тесты `test/unit/csvParser.test.ts`, `test/integration/csvImport.test.ts`, `test/ui/csvPreview.test.tsx`.

**Interfaces:** сохранить `preview(profileId,text): Promise<CsvPreview>` и `commit(preview): Promise<{added:number;duplicates:number;invalid:number}>`; добавить к внутреннему предпросмотру `existing: CsvRow[]` для тематических связей. Источник commit — сохранённый в WeakMap текст, повторно разобранный внутри транзакции; переданный UI-объект не является доверенным.

- [ ] Тесты `duplicate_joins_new_topic_without_reset`, `same_csv_word_in_two_topics`, `reimport_is_idempotent`, `preview_profile_roundtrip_is_stale`, `topic_failure_rolls_back_import`. У существующего слова после импорта прежние id/revision/перевод/XP/прогресс и старые темы; добавилась только новая связь. Внутри CSV повтор той же карточки в двух темах создаёт одну карточку и две связи. После A→B→A commit отвергается. non-noun с gender/plural попадает в errors с номером строки.
- [ ] Выполнить `npm test -- --runInBand --runTestsByPath test/unit/csvParser.test.ts test/integration/csvImport.test.ts test/ui/csvPreview.test.tsx`; зафиксировать ожидаемые FAIL.
- [ ] В commit сначала получить/создать слово по прежнему canonicalKey, затем добавить каждую указанную тему через идемпотентный INSERT связи. Пропущенные дубли не редактировать через saveWord. Пересчитывать результат по актуальному состоянию БД и сохранять проверку selection version. Транзакция покрывает слова и все темы. UI поясняет: «Существующие слова будут включены в темы без сброса прогресса».
- [ ] Повторить целевые тесты до PASS; коммит `feat: import new word types and retain duplicate topic membership`.

### V3. Backup 3 с совместимостью версий 1 и 2

**Files:** изменить `src/features/transfer/backupTypes.ts`, `backupValidation.ts`, `backupService.ts`, `backupRemap.ts`, `grammarBackupValidation.ts`, `docs/backup-format.md`; тесты `test/unit/backupValidation.test.ts`, `test/integration/backup.test.ts`, `test/integration/grammarBackup.test.ts`, `test/ui/backupTransfer.test.tsx`.

**Interfaces:** `BackupV3` имеет version=3 и те же общие поля; grammar-контейнер V3 содержит `catalogVersions: (1|2)[]` вместо одиночного catalogVersion. До G2 доступен только `[1]`; после G2 `[1,2]`. `validateBackup(value: unknown): BackupV3`; `RestorePreview.backup: BackupV3`. Явно сохранить legacy-типы V1/V2 (слова noun/adjective, грамматический каталог 1), не расширять их через общий mutable alias. Перечень допустимых каталогов V3 берётся из зарегистрированных каталогов приложения.

- [ ] Тесты `v3_roundtrip_all_word_parts`, `v1_v2_reject_new_parts`, `restore_remaps_all_profile_links`, `unicode_and_case_survive_roundtrip`. Экспорт→restore всех девяти типов, Sie и NFD-примера сохраняет значения после установленной NFC-нормализации; исходные профили и награды неизменны. Мнимые V1/V2 с number отвергаются; текущие legacy fixtures принимаются. Повреждённая ссылка/повторная награда откатывает весь restore.
- [ ] Запустить соответствующие четыре файла через `npm test -- --runInBand --runTestsByPath test/unit/backupValidation.test.ts test/integration/backup.test.ts test/integration/grammarBackup.test.ts test/ui/backupTransfer.test.tsx` (полные пути перечислены выше); подтвердить RED.
- [ ] Разделить проверку версии файла и общую проверку графа. Сначала строго проверить исходную версию, затем преобразовать во внутренний V3. Экспортировать V3, сохранить прежние правила переназначения UUID, лимит 50 МиБ и проверку XP/истории. Задокументировать, что старое приложение V3 не читает.
- [ ] Запустить те же тесты и typecheck; PASS. Коммит `feat: add backup v3 with strict legacy validation`.

### V4. Редактор, представление и обучение новым типам

**Files:** изменить `src/features/dictionary/WordEditorScreen.tsx`, `DictionaryRow.tsx`, `WordCardScreen.tsx`, `dictionaryPresentation.ts`, `GenderCard.tsx`; `src/features/learning/questionFactory.ts`; `src/features/audio/audioService.ts`; `src/features/assistant/assistantContext.ts`, `assistantPrompts.ts`; тесты `test/ui/wordEditor.test.tsx`, `wordCard.test.tsx`, `test/unit/questionFactory.test.ts`, `audioService.test.ts`, `assistantContext.test.ts`.

**Interfaces:** UI читает V1 `wordParts`; существующие `buildQuestion(word: Word, vocabulary: Word[], kind: QuizKind, attemptId: string): Question|null` и `displayGerman(word: Word): string` сохраняются. Новый тип не добавляет новый вид словарного вопроса.

- [ ] Тесты `part_selector_clears_noun_fields`, `non_nouns_have_no_gender_or_article`, `numbers_use_number_distractors`, `single_number_falls_back_to_typing`, `offline_voice_absent_does_not_block`, `assistant_receives_real_part`. Проверить 9 доступных подписей, переход noun→number очищает gender/plural; Sie сохраняет регистр; у числа нет der/die/das и родового цвета; в ru-de для числа отвлекают другие числа; меньше двух разных вариантов возвращает существующий переход к написанию; число 16 не считается ответом на sechzehn.
- [ ] Запустить пять перечисленных тестовых файлов; подтвердить RED.
- [ ] Использовать компактный раскрываемый выбор части речи. Сохранить имеющуюся клавиатурную компоновку. Ограничить артикли noun, отвлекающие варианты number→number. Обновить контекст помощника и озвучку без добавления артиклей non-noun; не изменять офлайн-проверку доступности голоса и правила XP.
- [ ] Повторить целевые тесты, `npm run typecheck`, `npm run lint`; PASS. Коммит `feat: train and edit all supported word parts`.

### V5. Проверенные учебные CSV: 21 + 300

**Files:** создать `content/vocabulary/numbers-0-20.csv`, `content/vocabulary/a1-300.csv`, `content/vocabulary/README.md`, `test/integration/vocabularyPacks.test.ts`. Исходные числа уже подготовлены в `/Users/anton/Documents/Codex/2026-10-03/j/outputs/german-a1-numbers/numbers-0-20.csv`.

**Interfaces:** CSV `de,ru,pos,gender,plural,example_de,example_ru,note,icon,topic`; использовать production parseCsv/csvRowToWord/CsvImportService. Отдельный loader приложения не нужен.

- [ ] Тест `packs_have_exact_counts_and_import_idempotently`: 21 число в указанном порядке, 300 уникальных canonicalKey A1, ровно 10 согласованных тем по 30, все примеры/переводы непустые; числа не входят в A1; число→тип number; noun→род. Импорт в профиль со стартовыми словами сохраняет их историю, повтор даёт added=0, все слова доступны в темах. Использовать временную SQLite production-repository, не дублировать parser в тесте.
- [ ] Выполнить `npm test -- --runInBand --runTestsByPath test/integration/vocabularyPacks.test.ts`; FAIL до файлов.
- [ ] Подготовить оба файла. Подборка 300 начальных A1 слов/выражений по темам спецификации; не называть её полным экзаменационным словарём. Для совпадающих стартовых слов оставить тот же перевод. Проверить вручную все переводы, немецкие примеры, род и plural, включая отсутствие обычного plural. В README указать источник тематического ориентира Goethe, самостоятельные примеры и правила eins/ein.
- [ ] Повторить тест до PASS; прочитать CSV после roundtrip через production parser, сверить 0–20 и выборочно каждую тему с примерами. Коммит `feat: provide numbers and A1 vocabulary import packs`.

**Выход этапа:** приложение со схемой 7 и backup 3 умеет все новые типы и оба импорта. Не устанавливать промежуточную сборку на личный телефон; дальше план грамматики, затем общий выпуск.
