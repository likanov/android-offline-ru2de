# Lektion 3 и 10 ответов в грамматике — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить упражнения 3.1–3.3 и завершать первоначальное освоение каждой грамматической цели после 10 правильных ответов подряд, сохранив словарный порог 20 и прежнюю историю.

**Architecture:** Сначала ввести версию правил грамматики 2, SQLite migration 9 и backup 4 с проверяемыми событиями перехода 20→10. Затем добавить доверенный каталог 3, migration 10, три представления вопросов и 40 целей Lektion 3. Оценивание остаётся локальным и детерминированным; существующие транзакции отвечают за XP, повторения и принадлежность профилю.

**Tech Stack:** TypeScript, React Native 0.85.3, React 19.2.3, Expo 56, expo-sqlite 56.0.6, Jest, React Native Testing Library, Maestro, Android API 36; существующий llama.rn 0.12.9 только для пояснения уже проверенной ошибки.

**Spec:** [2026-10-13-lektion3-plural-design.md](../specs/2026-10-13-lektion3-plural-design.md).

**Baseline:** Product commit `7828274`; спецификация `4db6386`. Рабочая копия подготовки плана — `work/worktrees/question-screen-ux`. На этапе исполнения проверить актуальный Git status и использовать `superpowers:using-git-worktrees`; создание нового checkout для написания этого плана не требуется.

## Global Constraints

- Вся грамматика: 10 верных подряд, ошибка до освоения сбрасывает серию в 0; словарь: 20 верных подряд.
- +10 XP за правильную попытку; +50 XP за первое освоение; десятый грамматический ответ даёт +60 XP, новая цель без ошибок — 150 XP. Уровень каждые 500 XP.
- Повторения: 1, 3, 7, 14, 30, 60 дней; ошибка при повторении сохраняет освоение и назначает завтра; трудность после 3 ошибок, снятие после 3 верных подряд.
- Старые серии 0–9 сохраняются, 10–19 автоматически осваиваются с одним бонусом 50 XP и повторением завтра; освоенные 20 переводятся в текущую серию 10 с сохранением расписания и прежнего бонуса.
- Переход правил не является ответом, не увеличивает attemptCount, число правильных ответов или дневную цель. Исторические JSON вопросов и результатов не переписываются.
- Итоговая SQLite schema 10: migration 9 — правила и журнал переходов; migration 10 — каталог 3. Каталоги 1/2 и их target/template ID совместимы.
- Backup 4 сохраняет версии правил и события перехода; чтение backup 1/2/3 сохраняется. Восстановление создаёт новые профили атомарно.
- Lektion 3: 34 существительных, 28 исходных артиклей, 25 заданий plural, 29 уникальных слов распознавания; 40 целей (14+25+1), общий каталог — 82.
- 3.3: 12 групп по 6 разных слов, 2 или 3 правильных; все 29 слов покрыты, каждое из 8 неизменяемых встречается минимум 3 раза. Один полностью правильный набор — одна попытка, без частичных XP.
- Варианты грамматических ответов — только немецкие; переводы, цвет рода и правильные plural скрыты до проверки. 3.2 требует артикль и существительное, максимум 64 символа.
- Unicode NFC и пробелы нормализуются; `Die Bücher` = `die Bücher`; регистр существительного, умлауты и акцент сохраняют значение. Wörter проверяется в контексте «отдельное слово языка».
- Уменьшительные формы -chen/-lein включаются в справочник, без учебных целей. Личный словарь не изменяется учебным каталогом.
- Приложение полностью офлайн, без новых зависимостей и INTERNET permission. Модель не оценивает ответы и не меняет прогресс.
- Проверить клавиатуру на ширине 320 dp и fontScale 1.5; использовать существующие QuestionScreen / GermanAnswerInput.
- Один AVD/serial имеет одного владельца. Host-тесты независимых областей могут идти параллельно; Android — последовательно или на разных AVD с отдельными артефактами. Пользовательский телефон не используется для очистки данных и регрессионных фикстур.

## Review Focus

1. Старая серия 10/19, переход через полночь или повторный запуск: одно освоение, один бонус, правильный локальный день, без автоматического правильного ответа — Tasks 1–3, 7.
2. Исторический результат с серией 20 и новый с 10: корректное воспроизведение каждой версии, прежние payload сохранены, текущий UI /10, словарь /20 — Tasks 1–3, 6.
3. Старый backup с поддельной серией, отсутствующим ledger или неправильным anchor перехода: отказ до записи, без добавления XP/профилей — Task 3.
4. Перестановка, пропуск, лишний/дублированный/неизвестный ID в 3.3, подмена expected при UUID-remap: точное сравнение множеств, некорректная отправка не меняет данные — Tasks 5–7.
5. Клавиатура, крупный шрифт, возврат из справки и смена профиля при выборе слов: поле/проверка доступны, выбор не теряется при возврате, чужой ответ не начисляет XP — Tasks 2, 6–8.

## Файлы и границы ответственности

| Область | Файлы |
| --- | --- |
| Общий параметр порога, без изменения defaults словаря | `src/features/learning/learningRules.ts`, `learningTypes.ts` |
| Версии грамматических правил, чистое преобразование состояния | новые `src/features/grammar/grammarRuleTypes.ts`, `grammarLearningRules.ts`, `grammarRulesUpgrade.ts` |
| Персистентность правил 2 и прежние занятия | новый `src/core/migrations/009_grammar_mastery.ts`; `src/core/migrations.ts`, grammar repository/answer/session services |
| Backup 4 и проверка смешанной истории | новые `src/features/transfer/grammarRulesBackupValidation.ts`, `backupRestorePreparation.ts`; существующие backup types/validation/service/remap |
| Проверенный учебный материал | новые `src/features/grammar/lektion3Types.ts`, `lektion3Content.ts`, `lektion3Reference.ts` |
| Новые вопросы и schema 10 | новые `lektion3QuestionFactory.ts`, `lektion3Answer.ts`, `src/core/migrations/010_lektion3.ts`; общий catalog/types/dispatch |
| Представление выбора нескольких слов | новый `GrammarMultiChoiceAnswer.tsx`; question view, presentation, training home, reference, assistant prompts |
| Android-доказательства | новые E2E-блоки `grammar-rules` и `grammar-lektion3`; runner, matrix, fixtures и state/report validators |

## Task 1: Версии правил и чистое преобразование 20→10

**Files:** изменить `src/features/learning/learningTypes.ts`, `learningRules.ts`, `src/features/grammar/grammarTypes.ts`; создать `grammarRuleTypes.ts`, `grammarLearningRules.ts`, `grammarRulesUpgrade.ts`, `test/unit/grammarLearningRules.test.ts`, `test/unit/grammarRulesUpgrade.test.ts`; сохранить и расширить `test/unit/learningRules.test.ts` для проверки default20.

**Interfaces:**
- `LearningPolicy = { requiredCorrect: 10 | 20 }`; `applyAnswer(state, right, mode, today, policy?: LearningPolicy): LearningTransition`, default `requiredCorrect:20`. Экспортировать `validateLearningState(state, policy): void`.
- `GrammarRulesVersion = 1 | 2`; `applyGrammarAnswer(state:LearningState, right:boolean, mode:'study'|'review', today:DayKey, rulesVersion:GrammarRulesVersion = 2): LearningTransition` выбирает 20 для версии 1, 10 для 2.
- `GrammarAttemptResult.rulesVersion?: GrammarRulesVersion`: отсутствие означает историческую версию 1; новые ответы всегда явно 2.
- `GrammarRulesTransition = { profileId:string; targetId:GrammarTargetId; fromRulesVersion:1; toRulesVersion:2; afterAttemptId:string|null; day:DayKey; stateBefore:LearningState; stateAfter:LearningState; xpDelta:0|50 }`.
- `upgradeGrammarState(state:LearningState, day:DayKey): {state:LearningState; xpDelta:0|50}`; `createGrammarRulesTransition(input: {profileId:string; targetId:GrammarTargetId; afterAttemptId:string|null; day:DayKey; stateBefore:LearningState}): GrammarRulesTransition`. Оба чистые; состояние до перехода проверяется по правилам 1. Уже установленный masteryBonusGranted предотвращает новый бонус.

- [ ] **RED:** написать `grammar_nine_to_ten_awards_sixty`, `word_nine_to_ten_stays_unmastered`, `legacy_nineteen_to_twenty_remains_valid`, `grammar_nine_error_resets`, `upgrade_zero_nine_ten_nineteen_twenty`, `upgrade_preserves_difficult_and_review_schedule`, `review_intervals_are_unchanged`. На дне `2026-10-13` проверить: новая серия 9 + верный → streak10/mastered/dueDay `2026-10-14`, xpDelta60; словарная серия 9 + верный → streak10/not mastered/xpDelta10; старая версия правил 1 из 19 →20/xpDelta60. Для старых 10 и19 преобразование даёт xpDelta50, для 0/9/освоенной20 —0. Входной объект не мутируется. Невалидный день или невозможное старое состояние отклоняются.

  Ключевые assertions для одинакового исходного состояния:

  ```ts
  const state: LearningState = {streak:9,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0};
  expect(applyGrammarAnswer(state,true,'study','2026-10-13',2)).toMatchObject({state:{streak:10,mastered:true,dueDay:'2026-10-14'},xpDelta:60});
  expect(applyAnswer(state,true,'study','2026-10-13')).toMatchObject({state:{streak:10,mastered:false},xpDelta:10});
  expect(upgradeGrammarState({...state,streak:19},'2026-10-13')).toMatchObject({state:{streak:10,mastered:true},xpDelta:50});
  expect(upgradeGrammarState({...state,streak:19,masteryBonusGranted:true},'2026-10-13').xpDelta).toBe(0);
  ```
- [ ] Запустить `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/unit/grammarLearningRules.test.ts test/unit/grammarRulesUpgrade.test.ts` → FAIL на отсутствующих интерфейсах/новом пороге.
- [ ] Реализовать интерфейсы. Только параметризовать общий переход и его проверку; словарные call sites продолжают default20. В грамматическом преобразовании сохранить счётчики ошибок/трудность; для ранее освоенных сохранить dueDay/reviewStage; для новых освоений назначить tomorrow/stage0. Не использовать языковую модель.
- [ ] Повторить новые тесты, существующие unit-тесты learningRules и `./scripts/toolchain.sh npm run typecheck` → PASS; зафиксировать `feat: version grammar learning rules with ten-answer mastery`.

## Task 2: Migration 9, однократные бонусы и live-грамматика /10

**Files:** создать `src/core/migrations/009_grammar_mastery.ts`, `test/fixtures/grammarSchema8.ts`, `test/integration/grammarRulesMigration.test.ts`, `test/ui/questionHeader.test.tsx`; изменить `src/core/migrations.ts`, `src/features/grammar/grammarRepository.ts`, `grammarAnswerService.ts`, `grammarSessionRepository.ts`, `GrammarTrainingScreen.tsx`, `GrammarQuestionView.tsx`, `src/ui/QuestionHeader.tsx`, `test/harness.ts`; обновить live-ожидания в `test/integration/grammarAnswers.test.ts`, `grammarProgress.test.ts`, `grammarSessions.test.ts`, `test/ui/grammarTraining.test.tsx`.

**Interfaces:**
- `migrateGrammarMastery(tx:SqlExecutor, today:DayKey):Promise<void>`; `migrate(db:SqlStore, today:DayKey = localDay(new Date())):Promise<void>` сохраняет совместимость существующих вызовов.
- Таблица `grammar_rule_transitions`: поля Task 1, состояния JSON; PK `(profileId,targetId,toRulesVersion)`, FK профиля/цели и nullable `afterAttemptId` в grammar_attempts. Строка grammar_progress имеет `rulesVersion=2`, streak0..10, `mastered=(streak=10)`.
- `QuestionHeader.requiredCorrect?:10|20` с default20. GrammarQuestionView получает `currentState:LearningState|null` для текущей серии/освоения; исторический result сохраняет свои right/xpDelta.
- `createSchema8GrammarFixture(db:SqlStore,day:DayKey):Promise<{profileIds:string[];targetIds:GrammarTargetId[]}>` создаёт реальную schema8 из migrations1–8, два независимых профиля и полный старый ledger по правилам 1 для серий 0/9/10/19/20. Прежние результаты и вопросы используются без новых полей; фикстура не вызывает обновлённый live-сервис для создания старого прогресса. Пять граничных целей закрепить в возвращаемом порядке; второй профиль проверяет изоляцию.
- `exportSchema8GrammarFixture(db:SqlStore):Promise<BackupV3>` в том же тестовом модуле сохраняет старый snapshot по контракту commit7828274 и проходит строгую legacy-валидацию. Helper переносим между машинами: host-тестам не нужен старый checkout или пользовательская БД. Fixture-код не включается в APK.

- [ ] **RED:** `schema8_upgrade_boundary_states_and_one_bonus`, `repeat_migration_is_idempotent`, `migration_failure_rolls_back_state_and_xp`, `auto_mastery_is_not_an_answer`, `pending_auto_mastered_question_is_cancelled`, `pending_nine_and_due_review_survive`, `new_live_grammar_uses_rules2`, `inactive_profile_cannot_submit`. При переходе двух неосвоенных целей с10/19 ожидается +100 XP, ровно два события xpDelta50, неизменные counts попыток/правильных ответов и word_progress. Освоенная20 получает streak10 и прежний dueDay. Двойной submit десятой live-попытки выдаёт 60 один раз, всего150 за цель.
- [ ] Запустить новые и затронутые integration/UI тесты по отдельным файлам → RED. Границы migration9 проверять напрямую через `schemaTransaction`, чтобы дальнейшее добавление migration10 не изменило тестируемый шаг.
- [ ] Реализовать migration9 через schemaTransaction с сохранением индексов и ссылок. Старые строки прочитать до перестройки; для каждой создать transition из Task1 и вставить состояние10. Добавить только migration XP в profiles/daily_activity, без correct/errors. После успешной транзакции `PRAGMA user_version=9`; foreign_key_check пуст. Повторная миграция не создаёт новые события. Не изменять migrations1–8.
- [ ] Перевести GrammarAnswerService на `applyGrammarAnswer(...,2)` и rulesVersion2 в новых result. Прежние принятые attemptId возвращают оригинальный result без XP. Отменить только pending study-вопросы по автоматически освоенным целям; оставить их payload в истории. После такого перехода следующий вопрос выбирается из оставшихся целей.
- [ ] Передавать /10 в Header и result-view всех грамматических уроков. При resume считывать актуальный progress даже когда session.result — исторический snapshot20. Словарный header остаётся /20.
- [ ] Повторить проверки → PASS; зафиксировать `feat: migrate existing grammar progress to ten-answer rules`. До Task3 этап не объявлять готовым к выпуску: backup должен поддержать новое состояние.

## Task 3: Backup 4 и проверяемая история двух правил

**Files:** создать `src/features/transfer/grammarRulesBackupValidation.ts`, `backupRestorePreparation.ts`, `test/unit/grammarRulesBackupValidation.test.ts`, `test/integration/grammarBackup4.test.ts`; изменить `backupTypes.ts`, `backupValidation.ts`, `grammarBackupValidation.ts`, `backupService.ts`, `backupRemap.ts`, `src/features/grammar/grammarTypes.ts` (alias PreLektion3Question); тесты `test/unit/backupVersionBoundaries.test.ts`, `grammarBackupValidation.test.ts`, `test/integration/backup.test.ts`, `grammarBackup.test.ts`, `test/ui/backupTransfer.test.tsx`.

**Interfaces:**
- Зафиксировать `PreLektion3Question` как прежний union каталогов1/2. Исторические BackupV1/V2/V3 сохраняют исходные типы/правила20; BackupV3.catalogVersions допускает только1/2. Конвертация V1/V2 в legacy V3 использует фиксированный список `[1,2]`, а не будущий общий getGrammarCatalogVersions; ruleVersion2 внутри старого формата отклоняется.
- `GrammarProfileBackupV4` содержит прежние таблицы, `catalogVersions:GrammarCatalogVersion[]`, `rulesVersion:2`, `rulesTransitions:GrammarRulesTransition[]`; `BackupV4.version=4`.
- `validateBackup(value:unknown):BackupV3|BackupV4` строго проверяет входной формат; V1/V2 приводятся к проверенному legacy V3 без смены порога. `validateBackupV4(value:unknown):BackupV4` — экспортная проверка. `RestorePreview.backup:BackupV3|BackupV4`.
- `prepareBackupRestore(source:BackupV3|BackupV4,today:DayKey):BackupV4` — чистая подготовка переходов и сумм; V4 не получает новые бонусы. `BackupService(db, today?:()=>DayKey)` использует один локальный день внутри restore transaction; `exportAll():Promise<BackupV4>`.
- `replayGrammarRules(part:GrammarProfileBackupV4):Map<GrammarTargetId,LearningState>` проверяет состояния/XP, переходы и их anchor. `remapGrammarBackup` / `remapBackup` принимают V4; `afterAttemptId` входит в UUID-links, option/target/template ID — стабильные значения.

- [ ] **RED:** `old_backups_are_validated_before_conversion`, `old_ten_streak_gets_one_restore_bonus`, `backup4_mixed_rules_roundtrip`, `restored_backup4_does_not_award_again`, `day_is_sampled_at_restore_not_preview`, `forged_streak_without_ledger_is_rejected`, `invalid_anchor_duplicate_transition_and_xp_are_atomic`, `historical_twenty_results_are_not_rewritten`, `catalog_subset_duplicate_and_unknown_versions`. Preview до полуночи, restore на `2026-10-14` → новый dueDay `2026-10-15`. Отказ оставляет число профилей и весь граф БД равными before. Legacy nonzero streak/attemptCount должны подтверждаться историей, включая случай отсутствия попыток. V4 принимает непустой поддерживаемый subset каталога, но отклоняет дубли/неизвестную версию и target вне объявленного набора.
- [ ] Запустить новые unit/integration файлы и прежние backupVersionBoundaries/grammarBackup → RED.
- [ ] Реализовать replay: отсутствие rulesVersion в старом результате =1; прежние ответы проверяются applyGrammarAnswer(version1), переход вставляется сразу после своего anchor, дальнейшие ответы —version2. Нельзя принимать старую версию после перехода, дубликат перехода, чужой anchor, неправильные before/after или бонус. Для targets без истории начальное состояние нулевое; новая цель может сразу работать по версии2.
- [ ] Проверять текущие progress, attemptCount и финальное состояние по ledger. masteryBonusGranted должен подтверждаться обычной grammar_rewards либо единственным переходом xpDelta50. Profile XP и дневной XP = word attempts + grammar attempts + transition XP; correct/errors считают только attempts.
- [ ] Export читает все таблицы в одной транзакции. Restore повторно валидирует preview, готовит legacy→V4 на текущий день, remap UUID, вставляет полный подготовленный граф в одной транзакции. Prepared profile/daily XP уже включает бонусы: вставка transitions не добавляет XP повторно. Сохранить legacy adjective normalization и проверки словаря по20. Не переписывать JSON старых строк БД ради добавления метаданных.
- [ ] Повторить тесты, typecheck → PASS; зафиксировать `feat: preserve versioned grammar history in backup four`. После Tasks1–3 старые уроки работают по10 и новые данные экспортируются/восстанавливаются.

## Task 4: Доверенный материал Lektion 3

**Files:** создать `src/features/grammar/lektion3Types.ts`, `lektion3Content.ts`, `lektion3Reference.ts`, `test/unit/lektion3Content.test.ts`.

**Interfaces:**
- `Lektion3Kind='noun-article'|'noun-plural'|'plural-invariant'`; `Lektion3NounId` — явный union стабильных ASCII slugs 34 слов спецификации (`strasse`, `maedchen`, `cafe` для специальных букв).
- `Lektion3Noun={id:Lektion3NounId;de:string;ru:string;gender:'m'|'f'|'n';plural:string;unchanged:boolean}`; неизменяемость сравнивает существительное без артикля.
- `Lektion3ArticleItem={id:string;sourceExercise:'3.1';sourceItem:number;nounId:Lektion3NounId;number:'singular'|'plural'}`; `Lektion3PluralItem={id:string;sourceExercise:'3.2';sourceItem:number;nounId:Lektion3NounId;contextRu:string}`; `Lektion3InvariantSourceItem={sourceExercise:'3.3';sourceItem:number;nounId:Lektion3NounId}`; `Lektion3InvariantGroup={id:string;nounIds:readonly Lektion3NounId[];expectedIds:readonly Lektion3NounId[]}`.
- `lektion3Nouns`, `lektion3ArticleItems`, `lektion3PluralItems`, `lektion3InvariantSourceItems`, `lektion3InvariantGroups` — readonly массивы этих типов; количества34/28/25/30/12 соответственно.
- `Lektion3TargetId` — шаблонные ID видов noun-article/noun-plural с nounId либо `plural-invariant:recognition`. `Lektion3Target={id:Lektion3TargetId;kind:Lektion3Kind;pronounId:null;labelRu:string;catalogVersion:3}`; `lektion3Targets:readonly Lektion3Target[]` —14+25+1 целей. `lektion3Reference` — четыре правила: `definite-article-nominative`, `noun-plural`, `plural-invariant`, `diminutives-chen-lein`.

- [ ] **RED:** `source_counts_and_forms_match_spec`, `stuhl_duplicate_keeps_two_source_positions`, `exact_eight_unchanged_nouns`, `twelve_groups_cover_all_twenty_nine`, `word_context_is_explicit`, `references_do_not_claim_suffix_guarantees`. Утверждения: 34/28/25/30/29/40; неизменяемые ID ровно Lehrer, Computer, Zimmer, Mädchen, Techniker, Sportler, Arbeiter, Designer. Каждая группа6 уникальных ID, правильных2 или3; восемь правильных встречаются ≥3 раз, все остальные ≥1. Формы Spielzeuge, Wörter, Cafés и умлауты совпадают со спецификацией.
- [ ] Запустить `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/unit/lektion3Content.test.ts` → RED.
- [ ] Заполнить встроенные данные по таблице/порядку спецификации. Группы сформировать детерминированно из фиксированных позитивного и негативного пулов с покрытием; не выводить plural по суффиксу. Этот task только создаёт материал, подключение к рабочему каталогу выполняется Task5.
- [ ] Повторить тест → PASS; зафиксировать `feat: add verified Lektion three plural content`.

## Task 5: Три вида вопросов, точная проверка и migration 10

**Files:** создать `src/features/grammar/lektion3QuestionFactory.ts`, `lektion3Answer.ts`, `src/core/migrations/010_lektion3.ts`, `test/unit/lektion3QuestionFactory.test.ts`, `lektion3Answer.test.ts`, `test/integration/lektion3Migration.test.ts`, `lektion3Sessions.test.ts`; изменить `grammarTypes.ts`, `grammarCatalog.ts`, `grammarQuestionFactory.ts`, `grammarSessionRepository.ts`, `grammarProgressRepository.ts`, `src/core/migrations.ts`, `src/features/transfer/backupRemap.ts`; тесты backup4 из Task3.

**Interfaces:**
- `GrammarCatalogVersion=1|2|3`; `GrammarLesson` добавляет Lektion3Kind. `getGrammarCatalogVersions()` → `[1,2,3]`; `isGrammarLesson(value:unknown):value is GrammarLesson` используется live-сессиями и V4-валидацией. Старые форматы сохраняют ограничения прежних уроков.
- Расширить GrammarOptionId артиклями `der|die|das`. `GrammarSubmission` добавляет `{kind:'multi-choice';optionIds:Lektion3NounId[]}`.
- `Lektion3Question` — union с catalogVersion3: kind noun-article / presentation cloze / responseMode choice|typed (`beforeDe:string`, `afterDe:string`, `options:GrammarOption[]`, `expected:{optionId:'der'|'die'|'das';token:string}`); kind noun-plural / presentation phrase / responseMode typed (`sourcePhraseDe:string`, `expected:{phrases:string[]}`); kind plural-invariant / presentation multi-choice / responseMode multi-choice (`options:{id:Lektion3NounId;label:string}[]`, `expected:{optionIds:Lektion3NounId[]}`, `feedback.items:{nounId:Lektion3NounId;singularDe:string;pluralDe:string;translationRu:string;unchanged:boolean}[]`). Общие identity, contextRu, feedback sentenceDe/translationRu/ruleId/explanationRu, dependencies, reviewStage/dueDay соответствуют существующему snapshot. Все эти вопросы dependencies=[].
- `makeLektion3Question(input:GrammarQuestionInput):Lektion3Question`; `validateLektion3Question(question:Lektion3Question):void`; `checkLektion3Answer(question:Lektion3Question,answer:GrammarSubmission):boolean`; `normalizePluralPhrase(text:string):string`.
- `migrateLektion3(tx:SqlExecutor):Promise<void>` добавляет catalog3/kinds/multi-choice responseMode, nullable pronounId для новых целей; вставляет40 targets, ordinal42..81. Общие start/resume/next/submit сигнатуры сохраняются.

- [ ] **RED:** `article_alternates_singular_plural_and_mode`, `plural_requires_full_phrase_and_keeps_umlaut_case`, `invariant_order_independent_exact_set`, `invalid_empty_duplicate_unknown_ids_do_not_mutate`, `snapshot_rejects_tampered_expected_and_options`, `empty_dictionary_generates_every_target`, `migration9_to10_preserves_old_graph`, `lektion3_mastery_ten_and_once_only_bonus`, `backup4_remap_preserves_stable_noun_ids`. Принять `Die Bücher`, NFC decomposed `die Bücher`, лишние пробелы; считать ошибкой `die bücher`, `die Bucher`, `Bücher`, `die Buch`. Перестановка правильных ID верна; пропуск/лишний известный ID — ошибочный ответ; некорректные ID/дубли/пустая отправка — invalid без изменения БД.
- [ ] Запустить новые unit/integration файлы и backup4 → RED.
- [ ] Реализовать новые union и фабрику по Task4. В article ровно три немецких варианта и явный number; plural всегда typed с первой попытки; invariant всегда multi-choice. Перемешивать порядок по attemptId, сохранять его в вопросе; валидатор сравнивает допустимые варианты независимо от порядка и не требует повторного shuffle после UUID-remap. Ни русский перевод, ни цвет/правильный plural не входят в pre-answer UI.
- [ ] Диспетчеризация общих make/validate/check идёт по catalogVersion, сохраняя старые фабрики и проверки. Верхняя граница variantIndex зависит от target: article2, plural1, invariant12; старые значения не меняются. Не переводить неверный ответ ученика в системную ошибку там, где он является допустимым вводом.
- [ ] Реализовать migration10 отдельно от9; schemaTransaction/rollback/foreign_key_check. Проверить установку с нуля и8→9→10. Добавить новые skills в summary; фильтр mixed продолжает означать старые18 целей. Backup4 принимает catalog3, legacy V3 не принимает его.
- [ ] Повторить тесты, typecheck → PASS; зафиксировать `feat: integrate Lektion three grammar questions and catalog`.

## Task 6: Уроки, ввод, выбор слов, справочник и объяснение ошибки

**Files:** создать `src/features/grammar/GrammarMultiChoiceAnswer.tsx`, `test/ui/lektion3Training.test.tsx`, `lektion3MultiChoice.test.tsx`; изменить `src/features/learning/TrainingHomeScreen.tsx`, `src/features/grammar/GrammarTrainingScreen.tsx`, `GrammarQuestionView.tsx`, `grammarPresentation.ts`, `GrammarReferenceScreen.tsx`, `grammarQuestionFactory.ts` (registry справки), `src/features/assistant/grammarErrorPrompts.ts`; тесты `test/ui/grammarNavigation.test.tsx`, `grammarExplanation.test.tsx`, `questionScreen.test.tsx`, `test/integration/grammarExplanation.test.ts`.

**Interfaces:**
- `lektion3Lessons` содержит три названия спецификации; TrainingHome отображает освоено/всего и dueCount для каждого, сворачиваемая группа `training-lektion3-toggle`.
- `GrammarMultiChoiceAnswer({options,disabled,onSubmit})`: selected ID локальны до отправки, onSubmit получает массив ID; accessibilityRole checkbox + checked state, минимум48 dp для выбора. Новый attemptId сбрасывает выбор.
- `grammarQuestionPrompt(question:GrammarQuestion):{instructionRu:string;prompt:string;sourceDe:string|null}` — один источник текста задания для UI и assistant prompts. `grammarLessonTitle` поддерживает три новых урока.
- Маркеры: `training-lektion3-noun-article`, `training-lektion3-noun-plural`, `training-lektion3-plural-invariant`; `grammar-multi-option-<nounId>`, `grammar-multi-submit`, `grammar-multi-feedback-<nounId>`. Существующие typed testID не меняются.

- [ ] **RED:** `three_lesson_routes_have_own_summaries`, `all_grammar_headers_ten_word_header_twenty`, `article_has_no_translation_or_gender_marker`, `plural_input_has_no_answer_placeholder`, `checkbox_state_submit_and_exact_feedback`, `reference_return_preserves_selection_and_typed_input`, `new_question_resets_selection`, `profile_switch_cannot_submit_old_selection`, `offline_rule_explanation_supports_three_new_kinds`. До submit не выводить feedback/expected в тексте и accessibility labels. После ошибки показать лишние/пропущенные выборы и правильные singular→plural пары для всех шести слов.
- [ ] Запустить новые и затронутые UI/integration тесты → RED.
- [ ] Реализовать компактную группу Lektion3. В typed использовать существующий GermanAnswerInput maxLength64 и клавиши ä/ö/ü/ß; в multi-choice предусмотреть прокрутку и отдельную «Проверить». Сохранить hidden-mounted grammarContent при переходе в справку, чтобы локальный draft переживал возврат. Перезапуск возобновляет snapshot вопроса; диск-персистентность незавершённого draft не добавлять.
- [ ] Добавить четыре правила Task4 в справочник. Для помощника сериализовать только сохранённый вопрос/принятый ошибочный ответ/проверенное решение/правило; в multi-choice передать также ID→label для понятного объяснения. При отсутствии модели встроенная справка доступна. Оценивание/XP не передавать модели.
- [ ] Повторить UI/integration тесты, typecheck/lint → PASS без новых ошибок/предупреждений; зафиксировать `feat: expose Lektion three practice and offline feedback`.

## Task 7: Регрессионные блоки и доказательства обновления

**Files:** создать `e2e/grammar-rules.yaml`, `e2e/grammar-lektion3.yaml`, соответствующие `e2e/checks/grammar-rules.*.yaml`, `grammar-lektion3.*.yaml`, `scripts/create-lektion3-fixtures.ts`, `test/integration/lektion3RegressionFixtures.test.ts`, `test/scripts/lektion3Regression.test.mjs`; изменить `e2e/matrix.json`, `scripts/emulator-regression.mjs`, `regression-upgrade.mjs`, `regression-report.mjs`, `regression-state.mjs`, `regression-evidence.mjs`, прежние grammar E2E/fixtures и script tests; документация `docs/regression-matrix.md`, `docs/emulator-regression.md`.

**Interfaces:**
- Runner принимает `--schema8-apk`, `--grammar-rules-fixture`, `--lektion3-fixture`; поддерживает blocks `grammar-rules`, `grammar-lektion3` и retained-upgrade source schema8→latest10.
- Генератор `createLektion3RegressionBackup(day:DayKey):Promise<BackupV4>` создаёт состояния через сервисы и отдельную валидированную legacy-schema8 fixture. Никаких test API в APK и копирования приватной БД в Android.
- Для прежних V2/V3 генераторов использовать переносимый frozen schema8 helper Task2 и историческую policy1, сохранив исходные функции/версии файлов. V2 содержит только catalog1 и прежние noun/adjective; V3 — catalog1/2. Legacy20 history не создаётся через новый live-сервис. Отдельно проверить импорт этих файлов в реальные старые APK соответствующей схемы перед upgrade.
- Канонические inputs под task-root `outputs/lektion3-release/inputs/`: `word-backup-v1.json`, `grammar-backup-v2.json`, `lektion2-backup-v3.json`, `grammar-rules-backup-v4.json`, `lektion3-backup-v4.json`, `dictionary-fixture.json`, `dictionary-large-fixture.json`, model folder, `task5.apk`, `schema5.apk`, `schema6.apk`, `schema8.apk` и provenance. Старые fixtures остаются по20, новые grammar fixtures —по10; слово —везде20.
- Schema8 baseline: свежий проверенный APK от7828274, SHA256 `8792cce02680a77aa51942e058ba96638b1c5ab10e16c99d0b2b7bf97763f946`, исходный архив `outputs/a1-lektion2-release/r3/release-7828274/app-release.apk`. Проверить наличие, хеш и подпись до копирования; если нет файла, собрать этот exact commit в отдельном checkout и записать новое provenance. Приватные backups Anton не использовать.

- [ ] **RED:** script contracts отвергают пропущенный новый block/check, неверный APK hash, skipped JUnit, отсутствие stateEvidence, неправильный transition XP/counter, stale backup expected или неполный upgrade. Фикстуры проходят validateBackupV4 и сохраняют версии1/2; старые V1/V2/V3 генерируются по прежнему контракту, а не простым изменением числа в новом backup.
- [ ] Запустить `./scripts/toolchain.sh npm run test:scripts` и новый integration-fixture test → RED.
- [ ] Реализовать 7 обязательных checks grammar-rules: `ten-answer-mastery`, `nine-error-reset`, `schema8-ten-upgrade`, `legacy-backup-conversion`, `backup4-roundtrip`, `word-threshold-twenty`, `profiles-reviews`. В upgrade границы0/9/10/19/20 проверяются export-before/export-after, history сохраняется, XP меняется только на сумму migration bonuses; повторный запуск не начисляет их снова.
- [ ] Реализовать 10 checks grammar-lektion3: `three-lessons`, `article-choice-typing`, `plural-correct-error`, `invariant-exact-set`, `empty-dictionary`, `keyboard-small-large`, `reference-help-return`, `force-stop-reboot`, `profile-isolation`, `backup4-roundtrip`. После restore UUIDs могут измениться, stable IDs/options/order —нет; E2E ответы привязываются к фактически сохранённому вопросу, не к координатам правильной кнопки.
- [ ] Обновить только live-ожидания старых грамматических flows на10; проверить grammar fixture generators, backup export helpers и summary assertions. Словарные20, дневная цель20 и sourceItem20 не менять. Старые upgrade baselines5/6 по-прежнему проверяются, final schema теперь10. Не скрывать старое покрытие ради новых блоков.
- [ ] Повторить contracts/fixture tests, validate Maestro syntax → PASS; зафиксировать `test: add grammar rules and Lektion three Android regression blocks`.

## Task 8: Host-проверки, release и полный Android-регресс

**Files:** при необходимости исправления в owning task с новым TDD-циклом; создать после реального прогона `docs/verification/2026-10-13-lektion3-regression.md`. APK, модели, фикстуры, screenshots/JUnit/logcat/report JSON —в `outputs/lektion3-release/`, без Git-коммита бинарных/личных данных.

**Interfaces:** один неизменный candidate APK и его SHA256; семь checks grammar-rules + десять grammar-lektion3 + весь прежний MATRIX. Exit0/report passed требуется от полного прогона; preflight/host/отдельный block не заменяет полный pass.

- [ ] Запустить `./scripts/toolchain.sh npm test -- --runInBand`, `./scripts/toolchain.sh npm run test:scripts`, `./scripts/toolchain.sh npm run typecheck`, `./scripts/toolchain.sh npm run lint`. Все тесты/typecheck должны пройти; прежние lint warnings записать отдельно, новых не добавлять. Unit/SQL/UI blocks можно распределить по независимым процессам с раздельными отчётами, затем выполнить общий host-run.
- [ ] Собрать `VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android`. Зафиксировать source commit, build log, SHA256 и сертификат. Скопировать APK в immutable candidate directory; проверить embedded JS, package ID, отсутствие INTERNET permission, 40 WAV и native model libraries через существующие build/release проверки.
- [ ] Подготовить и проверить inputs Task7. Использовать отдельный AVD `GermanVocabulary_API36` и Upgrade AVD; до запуска убедиться, что ими не пользуется другой процесс. Preflight не считать тестированием. Новый runner обязан проверять schema8 provenance и соответствие подписи кандидату, не печатая ключи подписи.
- [ ] Пройти grammar-rules, затем grammar-lektion3 отдельно на офлайн release. Зафиксировать JUnit, before/after exports, APK hash, screenshots и отсутствие crash/ANR. Для клавиатуры сделать закрытую/открытую/после-submit capture на320 dp/fontScale1 и1.5 с реальной IME; проверить поле и кнопку над клавиатурой и прокрутку multi-choice.
- [ ] Пройти прежние blocks по отдельности, затем полный прогон на том же APK. После любой продуктовой правки выпустить новый immutable candidate и заново получить обязательные доказательства; не смешивать результаты разных хешей. Прежний незавершённый регресс не объявлять passed.

Команды runner использовать с подготовленными canonical inputs, например из корня приложения:

```sh
LEKTION3_TASK_ROOT=/Users/anton/Documents/Codex/2026-10-03/j
LEKTION3_INPUTS="$LEKTION3_TASK_ROOT/outputs/lektion3-release/inputs"
LEKTION3_APK="$LEKTION3_TASK_ROOT/outputs/lektion3-release/candidate/app-release.apk"
./scripts/toolchain.sh npm run test:android:regression -- \
  --block grammar-rules \
  --sdk-root "$LEKTION3_TASK_ROOT/work/toolchains/android-sdk" \
  --maestro "$LEKTION3_TASK_ROOT/work/toolchains/maestro/maestro/bin/maestro" \
  --apk "$LEKTION3_APK" --avd GermanVocabulary_API36 \
  --model-dir "$LEKTION3_INPUTS/model" \
  --grammar-fixture "$LEKTION3_INPUTS/grammar-backup-v2.json" \
  --grammar-rules-fixture "$LEKTION3_INPUTS/grammar-rules-backup-v4.json" \
  --schema8-apk "$LEKTION3_INPUTS/schema8.apk" \
  --report-dir "$LEKTION3_TASK_ROOT/outputs/lektion3-release/grammar-rules"
```

Второй block использует `--block grammar-lektion3` и `--lektion3-fixture "$LEKTION3_INPUTS/lektion3-backup-v4.json"`, report-dir заканчивается на grammar-lektion3. Полный вызов после отдельных blocks:

```sh
./scripts/toolchain.sh npm run test:android:regression -- \
  --sdk-root "$LEKTION3_TASK_ROOT/work/toolchains/android-sdk" \
  --maestro "$LEKTION3_TASK_ROOT/work/toolchains/maestro/maestro/bin/maestro" \
  --apk "$LEKTION3_APK" --avd GermanVocabulary_API36 \
  --model-dir "$LEKTION3_INPUTS/model" \
  --previous-apk "$LEKTION3_INPUTS/task5.apk" \
  --grammar-previous-apk "$LEKTION3_INPUTS/schema5.apk" \
  --schema6-apk "$LEKTION3_INPUTS/schema6.apk" \
  --schema8-apk "$LEKTION3_INPUTS/schema8.apk" \
  --fixture "$LEKTION3_INPUTS/word-backup-v1.json" \
  --grammar-fixture "$LEKTION3_INPUTS/grammar-backup-v2.json" \
  --dictionary-fixture "$LEKTION3_INPUTS/dictionary-fixture.json" \
  --dictionary-large-fixture "$LEKTION3_INPUTS/dictionary-large-fixture.json" \
  --lektion2-fixture "$LEKTION3_INPUTS/lektion2-backup-v3.json" \
  --grammar-rules-fixture "$LEKTION3_INPUTS/grammar-rules-backup-v4.json" \
  --lektion3-fixture "$LEKTION3_INPUTS/lektion3-backup-v4.json" \
  --observations "$LEKTION3_TASK_ROOT/outputs/lektion3-release/observations.json" \
  --report-dir "$LEKTION3_TASK_ROOT/outputs/lektion3-release/full"
```

Runner preflight документировать и расширить так, чтобы standalone новые blocks не требовали unrelated inputs, а полный run требовал весь комплект. Не выдавать exit0 при отсутствии реальных observations обязательного полного регресса.

- [ ] Проверить отчёт существующим validator: все REQUIRED_SCENARIOS passed, ни failures/skips, корректные stateEvidence и единый APK SHA, crash/ANR=0. Записать в verification doc фактические команды, количества/статусы, копии путей и ограничения. Если среда прервала сценарий, оставить incomplete/not-verified и устранить причину по systematic-debugging.
- [ ] Провести свежий review всей ветки через superpowers:requesting-code-review; существенные замечания исправить с соответствующим TDD и повторной проверкой затронутых блоков/финального кандидата. Только после всех обязательных проверок дать результат готовности к объединению и установке. Этот запрос на план не запускает merge или deploy.

## Порядок и исполнение

Основная цепочка: **1→2→3→5→6→7→8**; Task4 независим отTask1 и должен завершиться доTask5. При сохранённом выборе пользователя «multi process» разрешены параллельные агенты для Tasks1/4 с указанным владением файлов и отдельным review; SQLite-интеграцию и общие types/migrations менять последовательно. Android-операции на одном serial выполняет один владелец.

Для каждого task: RED → минимальная реализация → GREEN → focused review → commit. Не запускать весь регресс после каждого изменения данных/компонента; полный host и Android run выполняются в Task8, а повторяются после новой правки или unresolved concern. План и спецификацию прочитать вместе до исполнения. План требует пользовательского review; реализация начинается по следующему запросу пользователя с ранее выбранным способом multi process.
