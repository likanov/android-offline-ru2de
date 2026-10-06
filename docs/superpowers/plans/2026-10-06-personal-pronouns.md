# Местоимения и sein Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить два вида грамматических вопросов с отдельным прогрессом профиля, общим XP, восстановлением занятий и офлайн-объяснением ошибки.

**Architecture:** Встроенный проверенный каталог и отдельные grammar-таблицы SQLite используют существующий чистый applyAnswer. Словарные типы и очереди сохраняются; навигация объединяет блоки только на экране выбора тренировки. Резервная копия v2 объединяет оба журнала попыток, а дополнительное объяснение использует существующий AssistantService и его единственный runtime.

**Tech Stack:** React Native, Expo, TypeScript, expo-sqlite, Jest, Testing Library, Maestro, существующий llama.rn.

**Spec:** [Проект расширения](../specs/2026-10-06-personal-pronouns-design.md). Читать вместе с планом. **18 серий — допущение для проверки:** 9 местоимений + 9 связей с sein; оба типа пользователь выбрал, группировку серий отдельно не подтвердил.

## Global Constraints

- React Native 0.85.3, React 19.2.3, Expo 56.0.23, TypeScript 5.9.2, expo-sqlite 56.0.6; новые зависимости не нужны.
- Приложение полностью работает без интернета; разрешение INTERNET не добавлять.
- Интерфейс и пояснения на русском; примеры на немецком с русским переводом после ответа.
- 20 правильных подряд завершают первоначальное изучение одной цели; ошибка до освоения сбрасывает её серию.
- Повторения через 1, 3, 7, 14, 30 и 60 дней; последующие успешные повторения снова через 60 дней.
- Ошибка при повторении назначает его на завтра и сохраняет первоначальное освоение.
- 3 ошибки добавляют цель в трудные; 3 правильных подряд убирают её оттуда; использовать действующий applyAnswer.
- +10 XP за правильный ответ, однократные +50 XP за первоначальное освоение цели; уровень каждые 500 XP.
- XP, календарь, дневная цель и серия дней общие для слов и грамматики внутри профиля; освоение слов и грамматики считать отдельно.
- Основной Android-профиль проверки — Pixel 9 Pro XL; дополнительно 320 dp, масштаб шрифта 1.5, открытая клавиатура, аппаратная кнопка «Назад».
- TDD для новой логики; Android-регрессия отдельными блоками, затем полный прогон на одном и том же APK.

## Review Focus

1. Начальное Sie и внутреннее sie/Sie: контекст задаёт смысл, значимый регистр не теряется. Тесты задачи 1 `initial_sie_requires_context`, `internal_formal_sie_preserves_case`.
2. Двойная отправка, смена профиля и сбой между XP и сохранением feedback: ровно одна попытка либо полный rollback. Тесты задачи 3 `concurrent_submit_awards_once`, `inactive_profile_rejected`, `answer_failure_rolls_back_all_tables`.
3. Редактирование зависимого слова и возврат после force-stop: устаревший вопрос заменяется без штрафа, отвеченный результат неизменен. Тесты задач 2/6 `stale_dependency_cancelled_without_penalty`, `answered_feedback_survives_reopen`.
4. v1/v2, подмена targetId/XP и ссылки между профилями: старые данные восстанавливаются, повреждённая копия отклоняется целиком. Тесты задачи 4 `v1_import_preserves_vocabulary`, `v2_rejects_tampered_grammar_and_ledger`, `v2_rejects_cross_profile_links`.
5. Отсутствующая/занятая модель, запоздалая генерация, 320 dp и клавиатура: обучение доступно, результат не уходит в другой профиль, кнопки достижимы. Тесты задач 6/7 `keyboard_submit_and_feedback_visible`, `grammar_error_without_model`, `grammar_generation_cancelled_on_profile_change`; Android-проверки задачи 8.

---

## Рабочая база и порядок

Рабочий каталог: `/Users/anton/Documents/Codex/2026-10-03/j/work/worktrees/german-assistant-practice`, ветка `assistant-practice-implementation`. Здесь уже есть незакоммиченные изменения предыдущей работы. Не выполнять reset/clean и не включать их автоматически в коммиты новой функции. Файлы ниже с прежними изменениями коммитить только по относящимся к задаче hunks; новые файлы добавлять явно. Если HEAD/схема изменились до исполнения, сначала сверить интерфейсы с этим планом.

Перед первым изменением продукта:

- [ ] Сохранить patch исходного dirty tree и исходный release APK SQLite v5 с SHA256 и provenance в `work/android-regression/grammar-upgrade-source/` корня задачи; если APK отсутствует, собрать текущую версию до задачи 1. Не подменять им Task5 APK старого upgrade-сценария.
- [ ] Выполнить `./scripts/toolchain.sh npm test -- --runInBand`, `./scripts/toolchain.sh npm run test:scripts`, `./scripts/toolchain.sh npm run typecheck`, `./scripts/toolchain.sh npm run lint`; зафиксировать исходные failures отдельно. Имеющийся upgrade-блок ещё не завершён из-за подготовки данных старого APK; это не основание исключать его из полного регресса.

Порядок зависимостей: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**. Для ранее выбранного многопроцессного исполнения задачи 4 и 5 могут выполняться независимо после 3; подготовка отдельных Android flows может идти после стабилизации интерфейса задачи 6. Общие `navigation.tsx`, `AppServices.ts`, `test/harness.ts` и регрессионный runner изменяет один исполнитель за раз. Один AVD нельзя использовать одновременно двумя прогонами; параллельные Android-блоки допустимы только на разных AVD/портах/каталогах данных и отчётов. Финальный полный прогон последовательный.

## Карта файлов

Все пути ниже относительно рабочего каталога. Создаваемые тесты — часть соответствующей задачи.

| Задача | Создать | Изменить | Ответственность |
| --- | --- | --- | --- |
| 1 | `src/features/grammar/grammarTypes.ts`, `grammarCatalog.ts`, `grammarQuestionFactory.ts`, `grammarAnswer.ts`, `src/data/grammarReference.ts`; `test/unit/grammarCatalog.test.ts`, `grammarQuestionFactory.test.ts`, `grammarAnswer.test.ts` | — | Типы, 18 целей, проверенные шаблоны, сравнение ответов |
| 2 | `src/core/migrations/006_grammar.ts`, `src/features/grammar/grammarRepository.ts`, `grammarSessionRepository.ts`; `test/integration/grammarMigrations.test.ts`, `grammarSessions.test.ts` | `src/core/migrations.ts`, `test/harness.ts` | Схема v6, состояние целей, устойчивые очереди |
| 3 | `src/features/grammar/grammarAnswerService.ts`; `test/integration/grammarAnswers.test.ts` | `test/harness.ts` | Атомарные попытки, XP, интервалы, трудные |
| 4 | `src/features/transfer/grammarBackupValidation.ts`, `grammarBackupRemap.ts`; `test/unit/grammarBackupValidation.test.ts`, `test/integration/grammarBackup.test.ts` | `backupTypes.ts`, `backupValidation.ts`, `backupRemap.ts`, `backupService.ts`, `TransferScreen.tsx` в `src/features/transfer/`; `test/integration/backup.test.ts`, `test/unit/backupValidation.test.ts`, `test/ui/backupTransfer.test.tsx` | Экспорт v2, импорт v1/v2, совместные итоги |
| 5 | `src/features/grammar/grammarProgressRepository.ts`; `test/integration/grammarProgress.test.ts` | `src/features/progress/progressRepository.ts` | Отдельная грамматическая сводка, общий календарь |
| 6 | `src/features/learning/TrainingHomeScreen.tsx`, `src/features/grammar/GrammarTrainingScreen.tsx`, `GrammarQuestionView.tsx`, `GrammarTypedAnswer.tsx`, `GrammarReferenceScreen.tsx`; `test/ui/grammarTraining.test.tsx`, `trainingHome.test.tsx`, `today.test.tsx`; `e2e/helpers/open-vocabulary-training.yaml` | `src/app/AppServices.ts`, `navigation.tsx`, `src/features/progress/TodayScreen.tsx`, `ProgressScreen.tsx`; `test/ui/navigation.test.tsx`, `progress.test.tsx`; все существующие flows, напрямую открывающие `nav-training` | Вход, вопрос, feedback, справочник, возврат и доступность |
| 7 | `src/features/grammar/grammarErrorContext.ts`, `grammarErrorPrompts.ts`, `GrammarExplanationScreen.tsx`; `test/integration/grammarExplanation.test.ts`, `test/ui/grammarExplanation.test.tsx` | `src/features/assistant/practiceTypes.ts`, `assistantService.ts`, `src/app/navigation.tsx` | Встроенное и необязательное модельное объяснение |
| 8 | `e2e/grammar-core.yaml`, `grammar-progress.yaml`, `grammar-persistence.yaml`, `grammar-transfer-assistant.yaml`, `e2e/checks/grammar-*.yaml`, `test/integration/grammarRegressionFixtures.test.ts`, `scripts/review-regression-report.mjs`, `test/scripts/regressionReview.test.mjs` | `e2e/matrix.json`, `scripts/create-regression-fixtures.ts`, `emulator-regression.mjs`, `regression-state.mjs`, `regression-report.mjs`, `regression-evidence.mjs`; `test/integration/regressionFixtures.test.ts`; `test/scripts/regressionFlows.test.mjs`, `regressionState.test.mjs`, `emulatorRegression.test.mjs`, `regressionEvidence.test.mjs`; `docs/regression-matrix.md`, `emulator-regression.md` | Блоки, fixtures, доказательства состояния и runner |
| 9 | Отчёты и артефакты в `work/android-regression/grammar/` корня задачи | Этот план: отметки исполнения и ссылки на отчёты | Release build, отдельные блоки, полный регресс |

Не переносить в этот план общую переработку словаря/поиска. При разделении работы передавать исполнителю весь блок Interfaces его задачи и spec, чтобы одинаковые имена не менялись между процессами.

### Task 1: Каталог, вопросы и проверка

**Files:** строка 1 карты файлов.

**Interfaces:** в `grammarTypes.ts` определить:

```ts
type PronounId = 'ich' | 'du' | 'er' | 'sie_feminine' | 'es' | 'wir' | 'ihr' | 'sie_plural' | 'sie_formal';
type GrammarKind = 'pronoun-cloze' | 'sein-cloze';
type SeinForm = 'bin' | 'bist' | 'ist' | 'sind' | 'seid';
type GrammarTargetId = `${GrammarKind}:${PronounId}`;
type GrammarOptionId = PronounId | SeinForm;
type GrammarSubmission = {kind:'choice'; optionId:GrammarOptionId} | {kind:'typed'; text:string};
type GrammarSelection = {mode:'study'|'review'; lesson:'mixed'|'pronouns'|'sein'; targetIds?:GrammarTargetId[]};
type GrammarProgress = {targetId:GrammarTargetId; state:LearningState; attemptCount:number; variantIndex:number};
type GrammarTarget = {id:GrammarTargetId; kind:GrammarKind; pronounId:PronounId; labelRu:string; catalogVersion:1};
type GrammarOption = {id:GrammarOptionId; label:string};
type GrammarWordDependency = {wordId:string; revision:number; de:string; ru:string; gender:'m'|'f'|'n'; plural:string|null};
type GrammarQuestion = {
  attemptId:string; sessionId:string; profileId:string; targetId:GrammarTargetId;
  catalogVersion:1; templateId:string; kind:GrammarKind; responseMode:'choice'|'typed';
  position:'initial'|'internal'; contextRu:string; beforeDe:string; afterDe:string;
  options:GrammarOption[]; expected:{optionId:GrammarOptionId; token:string};
  feedback:{sentenceDe:string; translationRu:string; ruleId:'pronouns-nominative'|'sein-present'; explanationRu:string};
  dependencies:GrammarWordDependency[]; reviewStage:number|null; dueDay:DayKey|null;
};
type GrammarQuestionInput = Pick<GrammarQuestion,'attemptId'|'sessionId'|'profileId'|'targetId'|'responseMode'|'reviewStage'|'dueDay'> & {variantIndex:number; words:Word[]};
type GrammarAttemptResult = {attemptId:string; targetId:GrammarTargetId; right:boolean; xpDelta:number; state:LearningState; submittedAnswer:GrammarSubmission};
type GrammarSession = {id:string; profileId:string; selection:GrammarSelection; targetIds:GrammarTargetId[]; cursor:number; currentQuestion:GrammarQuestion|null; result:GrammarAttemptResult|null; status:'active'|'completed'|'cancelled'};
```

Использовать существующие `Word`, `LearningState`, `DayKey` через импорты. Экспорты: `grammarTargets: readonly GrammarTarget[]`, `validateGrammarCatalog():void`, `makeGrammarQuestion(input:GrammarQuestionInput):GrammarQuestion`, `validateGrammarQuestion(question:GrammarQuestion):void`, `grammarResponseMode(attemptCount:number):'choice'|'typed'`, `checkGrammarAnswer(question:GrammarQuestion, answer:GrammarSubmission):boolean`. Справочник: `grammarReference: Record<GrammarQuestion['feedback']['ruleId'],{title:string;text:string}>`.

- [ ] **RED:** написать `catalog_has_18_targets_and_five_sein_forms`, `each_target_has_three_unambiguous_templates`, `initial_sie_requires_context`, `internal_formal_sie_preserves_case`, `choices_have_unique_semantic_ids`, `unsupported_dictionary_uses_builtin_example`, `response_modes_share_target`. Проверять каждую цель и оба положения местоимения; модифицированный Tisch с неверным родом и Mädchen не становятся персональными примерами. Например:

```ts
expect(grammarTargets).toHaveLength(18);
expect(grammarResponseMode(0)).toBe('choice');
expect(grammarResponseMode(2)).toBe('choice');
expect(grammarResponseMode(3)).toBe('typed');
expect(grammarResponseMode(4)).toBe('choice');
expect(checkGrammarAnswer(internalFormal, {kind:'typed',text:' sie '})).toBe(false);
expect(checkGrammarAnswer(internalFormal, {kind:'typed',text:' Sie '})).toBe(true);
expect(checkGrammarAnswer(initialPlural, {kind:'typed',text:'Sie'})).toBe(true);
expect(checkGrammarAnswer(initialPlural, {kind:'typed',text:'sie'})).toBe(false);
```

Отдельные asserts: blank/65 символов/неизвестная опция/неверный kind ответа бросают `GRAMMAR_ANSWER_INVALID`; неверная допустимая опция возвращает false. Неоднозначный шаблон/изменённый expected отвергаются `GRAMMAR_QUESTION_INVALID`.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/unit/grammarCatalog.test.ts test/unit/grammarQuestionFactory.test.ts test/unit/grammarAnswer.test.ts`; ожидается падение из-за отсутствующих экспортов или требуемого поведения.
- [ ] **Реализовать интерфейсы:** версия каталога 1, минимум 54 проверенных шаблона, контекст и семантические ID из spec. Валидировать таблицу спряжения/target/template/ожидаемый токен; неоднозначность русских контекстов дополнительно проверить редакторским просмотром каждого шаблона. Личные слова подставлять только из списка Tisch/Lampe/Buch/Haus/Computer с каноническими родом/множественным числом; сохранять dependency snapshot. Опции перемешивать по attemptId, не Math.random. Проверку словаря и QuizKind не менять.
- [ ] **GREEN:** повторить команду RED плюс `test/unit/normalizeAnswer.test.ts` и `test/unit/questionFactory.test.ts`; всё проходит, прежняя проверка слов не изменилась.
- [ ] **Commit:** явно добавить новые файлы строки 1; `git commit -m "feat: define offline pronoun and sein questions"`.

### Task 2: SQLite v6 и восстановление сессии

**Files:** строка 2 карты. **Consumes:** типы и factory задачи 1, `SqlStore`, `SqlExecutor`. **Produces:** `grammarSchema:string`; `GrammarRepository(db:SqlStore).getState(profileId:string,targetId:GrammarTargetId):Promise<GrammarProgress>`; `readGrammarProgress(tx:SqlExecutor,profileId:string,targetId:GrammarTargetId):Promise<GrammarProgress>` и `writeGrammarProgress(tx:SqlExecutor,profileId:string,progress:GrammarProgress):Promise<void>` в `grammarRepository.ts`.

`GrammarSessionRepository(db:SqlStore)` предоставляет `start(profileId:string,selection:GrammarSelection,today:DayKey):Promise<GrammarSession|null>`, `resume(profileId:string):Promise<GrammarSession|null>`, `next(profileId:string,sessionId:string,today:DayKey):Promise<GrammarQuestion|null>`, `cancelQuestion(profileId:string,sessionId:string):Promise<void>`. В `test/harness.ts` добавить `createGrammarHarness(path?:string)`, расширяющий `createWordHarness` полями `grammar`, `grammarSessions`; задачу 3 подключить позже полем `grammarAnswers`.

- [ ] **RED:** `migrates_v5_to_v6_without_changing_word_data` сравнивает все старые строки до/после, user_version=6, 18 targets; повторный migrate идемпотентен; версия 7 отклоняется. `grammar_foreign_keys_and_one_active_session` проверяет чужой profile/session/target и уникальность активной сессии. `grammar_and_word_sessions_resume_independently` оставляет обе сессии живыми. `resume_keeps_question_and_variant` закрывает/открывает файловую SQLite. `stale_dependency_cancelled_without_penalty` меняет revision и проверяет отсутствие попыток/XP/сброса. `queue_fairness_and_review_once` проверяет лимит 5, фильтры урока и удаление повторённой цели из очереди.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarMigrations.test.ts test/integration/grammarSessions.test.ts`; ожидается отсутствие схемы/репозиториев.
- [ ] **Реализовать схему/репозитории:** шесть таблиц spec; CHECK для диапазонов состояния/каталога/режимов, составные FK профиля с сессией/целью, unique active grammar-session по profileId, unique active question по sessionId, PK rewards(profileId,targetId). `grammar_progress` хранит поля LearningState и счётчики, прочтение отсутствующей строки возвращает нули после проверки профиля/target. Увеличить верхнюю поддерживаемую версию migrate до 6 и добавить миграцию в его существующую транзакцию. Курсор и вопрос сохранять атомарно; запросы зависимости выполнять через tx, без вызова другого сервиса, начинающего транзакцию. `resume` возвращает текущий вопрос и feedback; `next` возвращает текущий неотвеченный вопрос либо создаёт следующий после сохранённого ответа. На mount UI вызывает resume и вызывает next только если вопроса нет; «Продолжить» вызывает next явно. Отменять только неотвеченные вопросы. При устаревании возвращать код `GRAMMAR_QUESTION_STALE`, обновив статус вопроса отдельным атомарным действием; UI затем просит следующий без штрафа. Не делать rollback отмены из-за throw внутри транзакции.
- [ ] **GREEN:** повторить RED и `test/integration/answers.test.ts`; прежний словарный session/word_progress сохраняется. До появления сервиса задачи 3 завершение/попытки в тестах очереди готовить явными валидными SQL fixtures.
- [ ] **Commit:** относящиеся hunks строки 2; `git commit -m "feat: persist grammar targets and sessions"`.

### Task 3: Атомарные ответы и правила прогресса

**Files:** строка 3 карты. **Consumes:** `checkGrammarAnswer`, `readGrammarProgress`, `writeGrammarProgress`, сохранённые вопросы/сессии задачи 2; `applyAnswer(state:LearningState,right:boolean,mode:'study'|'review',today:DayKey)`. **Produces:** `GrammarAnswerService(db:SqlStore).submit(profileId:string,sessionId:string,attemptId:string,answer:GrammarSubmission,today:DayKey):Promise<GrammarAttemptResult>` и `createGrammarHarness(...).grammarAnswers`.

- [ ] **RED:** `nineteen_to_twenty_awards_sixty_once`, `error_at_nineteen_resets_only_grammar_target`, `all_review_intervals_and_error_tomorrow`, `three_errors_and_three_correct_recovery`, `concurrent_submit_awards_once`, `inactive_profile_rejected`, `answer_failure_rolls_back_all_tables`, `wrong_target_or_response_mode_rejected`. Assertions: 20 правильных = 250 XP, на 20-м +60; ошибка на 19 даёт streak=0 и XP не меняет; после mastery ошибочный review сохраняет mastered/streak=20 и dueDay=завтра; success интервалы 1/3/7/14/30/60/60. Для двойной отправки:

```ts
const [a,b] = await Promise.all([
  h.grammarAnswers.submit(profileId,sessionId,q.attemptId,answer,today),
  h.grammarAnswers.submit(profileId,sessionId,q.attemptId,answer,today),
]);
expect(a).toEqual(b);
expect((await h.db.first<{n:number}>('SELECT COUNT(*) n FROM grammar_attempts WHERE attemptId=?',[q.attemptId]))?.n).toBe(1);
```

Снимки всех шести grammar-таблиц, profiles, daily_activity и word_progress до/после fault injection доказывают rollback. Повтор с другим текстом возвращает первый результат; недопустимый ответ не создаёт попытку. Возврат из объяснения не начисляет XP.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarAnswers.test.ts`; сервис отсутствует/правила не выполняются.
- [ ] **Реализовать submit:** сначала профиль и дедупликация уже принятой попытки, затем session/active-question/target/dependency/responseMode/review-snapshot. В транзакции вызвать applyAnswer, увеличить attemptCount ровно на 1, записать attempt/reward/progress/общие XP/daily_activity/question status/session result. Проверка устаревания не должна оставлять частичный результат; отмену stale-вопроса провести с commit, затем сообщить код ошибки. Не начислять ничего за malformed/stale/чужой/неактивный запрос. После commit вызвать `notifyProfileChanged(profileId)`. Уровни не хранить отдельно, остаётся existing levelForXp.
- [ ] **GREEN:** команда RED плюс `test/unit/learningRules.test.ts` и `test/integration/answers.test.ts`; всё проходит, word_progress не меняется от grammar-ответа.
- [ ] **Commit:** файлы строки 3; `git commit -m "feat: score grammar answers atomically"`.

### Task 4: Резервная копия v2 и импорт v1

**Files:** строка 4 карты. **Consumes:** типы/схема/попытки задач 1–3. **Produces:** `GrammarProfileBackup {catalogVersion:1;progress:(GrammarProgress & {profileId:string})[];sessions:GrammarSession[];questions:{question:GrammarQuestion;status:'active'|'answered'|'cancelled'}[];attempts:{profileId:string;sessionId:string;targetId:GrammarTargetId;day:DayKey;result:GrammarAttemptResult}[];rewards:{profileId:string;targetId:GrammarTargetId;attemptId:string;amount:50;day:DayKey}[]}`.

В `backupTypes.ts`: сохранить BackupV1/ProfileBackup; добавить `ProfileBackupV2 = ProfileBackup & {grammar:GrammarProfileBackup}`, `BackupV2 = Omit<BackupV1,'version'|'profiles'> & {version:2;profiles:ProfileBackupV2[]}`; RestorePreview.backup становится BackupV2, появляется `grammarTargetCount:number`. `validateBackupV1(value:unknown):BackupV1` сохраняет строгие правила v1; `validateBackup(value:unknown):BackupV2` валидирует v1 и нормализует его пустым grammar либо валидирует v2. `validateGrammarProfile(part:ProfileBackupV2):void`, `validateCombinedLedger(part:ProfileBackupV2):void`, `remapGrammarBackup(grammar:GrammarProfileBackup,ids:ReadonlyMap<string,string>):GrammarProfileBackup`; существующий `remapBackup(backup:BackupV2,existingNames:string[]):ProfileBackupV2[]`. `BackupService.exportAll():Promise<BackupV2>`, существующие preview/restore используют новый RestorePreview.

- [ ] **RED:** `v1_import_preserves_vocabulary` использует фиксированную v1 fixture, сохраняет words/XP/active word question и grammar пустой. `v2_roundtrip_restores_both_sessions` содержит ошибочную grammar-попытку, mastery reward, active question и answered feedback; проверяет новый UUID каждой ссылки, неизменный targetId. `v2_combined_daily_ledger` смешивает словарные/grammar попытки за один день. `v2_rejects_tampered_grammar_and_ledger` подменяет expected/token/target/catalogVersion/bonus/day/XP, дублирует attemptId между блоками и проверяет отказ. `v2_rejects_cross_profile_links`, `restore_failure_is_atomic`, лимит 50 MiB и незнакомая версия отклоняются. UI preview показывает число профилей, слов и целей с сохранённым грамматическим прогрессом.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/unit/grammarBackupValidation.test.ts test/integration/grammarBackup.test.ts test/ui/backupTransfer.test.tsx`.
- [ ] **Реализовать формат:** отделить структурные/ссылочные проверки словарного раздела от проверки общих сумм; v1 вызывает прежний word-only ledger, v2 — combined ledger. Нельзя передавать v2 в старый валидатор с XP только от слов или вычитать грамматический XP для обхода проверки. Полный ID map создать до remap, включая grammar session/attempt IDs; dependency.wordId и все вложенные currentQuestion/result remap согласованно. Проверять grammar question по неизменному шаблону и dependency snapshot, активную зависимость также по восстановленному слову. Отвеченные исторические snapshots не переписывать текущей карточкой. Экспортировать/восстанавливать всё в одной транзакции; targets из каталога не из файла. Новые grammar-записи не терять при отмене импорта; reminder/model exclusions оставить прежними.
- [ ] **GREEN:** команда RED плюс `test/integration/backup.test.ts` и `test/unit/backupValidation.test.ts`; старые случаи corruption по-прежнему отклоняются. Прежние тесты export.version обновить на 2, тесты импорта v1 оставить на настоящей v1 fixture.
- [ ] **Commit:** только hunks строки 4; `git commit -m "feat: preserve grammar progress in backup v2"`.

### Task 5: Статистика без смешения учебных целей

**Files:** строка 5 карты. **Consumes:** grammar attempts/targets/progress, существующая daily_activity. **Produces:** `GrammarProgressSummary {mastered:number;totalTargets:18;dueCount:number;difficultCount:number;skills:Record<GrammarKind,{correct:number;errors:number}>}`; `GrammarProgressRepository(db:SqlStore).summary(profileId:string,today:DayKey):Promise<GrammarProgressSummary>`. В существующий ProgressSummary добавить `grammar:GrammarProgressSummary`.

- [ ] **RED:** `grammar_summary_is_profile_scoped` даёт различное состояние двум профилям и totalTargets=18 при нулевом прогрессе. `word_mastery_does_not_include_grammar` оставляет old mastered/totalWords неизменными. `combined_xp_goal_calendar_and_level` проверяет сумму обоих блоков, общую дневную цель, переход 490→500, один день активности и отсутствие двойного суммирования daily_activity. `grammar_due_uses_local_day_and_includes_overdue` проверяет dueDay=today/вчера/завтра и переход суток/DST через существующий DayKey.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarProgress.test.ts`.
- [ ] **Реализовать summary:** агрегировать grammar отдельно по target kind; общую daily_activity и profiles.xp читать как уже объединённый ledger, не прибавлять grammar повторно. Отсутствующие progress строки означают неосвоенные цели. Не расширять словарный Skill и не менять ReminderService: он уже использует общую дневную цель.
- [ ] **GREEN:** повторить RED плюс `test/integration/progress.test.ts`; `./scripts/toolchain.sh npm run typecheck`. UI-заглушки обновить новым полем grammar без удаления old assertions.
- [ ] **Commit:** hunks строки 5; `git commit -m "feat: report grammar progress separately"`.

### Task 6: Компактный интерфейс обучения

**Files:** строка 6 карты. **Consumes:** сервисы 2/3, summary 5, справочник 1. **Produces:** `getGrammarServices(app:AppServices):{sessions:GrammarSessionRepository;answers:GrammarAnswerService;progress:GrammarProgressRepository}`, кэшированный по SqlStore. Компоненты:

- `TrainingHomeScreen({db,profileId,onVocabulary,onGrammar})`, где `onVocabulary:(selection:TrainingSelection)=>void`, `onGrammar:(selection:GrammarSelection)=>void`.
- `GrammarTrainingScreen({db,profileId,selection,today?,onReference,onExplainError})`, где today?:DayKey, onReference:()=>void, onExplainError:(attemptId:string)=>void.
- `GrammarQuestionView({question,result,busy,onSubmit,onNext,onExplainError})`: question:GrammarQuestion, result:GrammarAttemptResult|null, busy:boolean, onSubmit:(answer:GrammarSubmission)=>void, onNext:()=>void, onExplainError:()=>void.
- `GrammarTypedAnswer({disabled,onSubmit})`: disabled:boolean, onSubmit:(text:string)=>void.
- `GrammarReferenceScreen({onBack})`: onBack:()=>void.

Routes: добавить `training-home`, `grammar-training`, `grammar-reference`, позже `grammar-explanation`; поля `grammarSelection?:GrammarSelection`, `grammarAttemptId?:string`. Существующий `training` оставить словарным. `nav-training` открывает hub, все grammar routes подсвечивают существующую вкладку «Тренировка». TodayScreen получает `onGrammar:(selection:GrammarSelection)=>void`.

- [ ] **RED:** `training_home_opens_both_blocks_and_resumes`, `grammar_choice_then_typing_same_target`, `feedback_hides_expected_before_submit`, `keyboard_submit_and_feedback_visible`, `answered_feedback_survives_reopen`, `hardware_back_returns_to_hub`, `reference_returns_to_same_question`, `switching_blocks_preserves_word_session`, `stale_question_shows_update_then_continues`. Mock/stored result показывает 19→20 и неправильный review без потери mastery. Проверить disabled/один submit при double tap, русские accessibility labels, отсутствие таблицы справочника внутри вопроса. ProgressScreen показывает «Освоено слов» отдельно от N/18; Today общую цель и переход в грамматику.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/ui/grammarTraining.test.tsx test/ui/trainingHome.test.tsx test/ui/navigation.test.tsx test/ui/today.test.tsx test/ui/progress.test.tsx`.
- [ ] **Реализовать компоненты/навигацию:** использовать существующие Screen/Button/theme; KeyboardAvoidingView и прокрутку, минимум 48 dp. Фильтр урока только в hub. Текущий вопрос/feedback берётся из repository, не пересчитывается на render. После ответа есть одна основная кнопка «Продолжить», правило/перевод и ошибка доступны без модели. Back из задания возвращает hub, сохраняя сессию; Back из reference возвращает тот же вопрос. Переключение между блоками не вызывает cancel чужого вопроса; существующие reveal-card/help словаря сохраняют свою логику. В AppServices никаких eager model allocations. Новые testID: `training-vocabulary-start`, `training-grammar-start`, `grammar-review-start`, `grammar-prompt`, `grammar-context`, `grammar-option-<id>`, `grammar-answer-input`, `grammar-submit`, `grammar-result`, `grammar-streak`, `grammar-next`, `grammar-reference-open`, `grammar-error-open`.
- [ ] **Сохранить существующий E2E вход:** создать `e2e/helpers/open-vocabulary-training.yaml` (открывает nav-training и training-vocabulary-start). Найти все прямые входы через `rg -n 'nav-training' e2e` и заменить их этим helper там, где сценарий ожидает словарный вопрос; upgrade-before старого APK не менять на новый hub. Другие вкладки и компактное меню не переделывать.
- [ ] **GREEN:** команда RED плюс `./scripts/toolchain.sh npm run typecheck` и `./scripts/toolchain.sh npm run test:scripts`; Jest не доказывает 320 dp/клавиатуру на Android — это обязательный сценарий задачи 8.
- [ ] **Commit:** относящиеся hunks строки 6; `git commit -m "feat: add compact grammar training flow"`.

### Task 7: Объяснение ошибки без обязательной модели

**Files:** строка 7 карты. **Consumes:** сохранённые question/result задачи 3 и справочник задачи 1; один существующий AssistantService. **Produces:** `GrammarErrorContext {question:GrammarQuestion;result:GrammarAttemptResult;reference:{title:string;text:string}}` в `grammarErrorContext.ts`; `loadGrammarErrorContext(db:SqlStore,profileId:string,attemptId:string):Promise<GrammarErrorContext>`, `buildGrammarErrorMessages(context:GrammarErrorContext):GenerationRequest['messages']` в `grammarErrorPrompts.ts`; GenerationRequest импортировать из существующего `src/features/assistant/runtimeTypes.ts`.

Расширить PracticeRequest ветвью `{kind:'grammar-error';profileId:string;attemptId:string}`; PracticeResult — `GrammarErrorExplanation {kind:'grammar-error';profileId:string;attemptId:string;text:string;referenceTitle:string}`. `AssistantService.generatePractice` сохраняет текущую сигнатуру с расширенными union types. `GrammarExplanationScreen({db,profileId,attemptId,assistant,onModelSetup,onBack})` получает db:SqlStore, assistant:AssistantService и два callback:()=>void.

- [ ] **RED:** `grammar_error_without_model` показывает локальное правило немедленно и не вызывает runtime. `grammar_error_uses_saved_attempt_and_correct_rule` различает sie_feminine/sie_formal, rejects чужой/правильный attempt; snapshot не меняется после редактирования слова. `grammar_prompt_treats_answer_as_data` передаёт adversarial submitted text как JSON-данные, не как instruction. `grammar_generation_cancelled_on_profile_change`, `grammar_and_word_generations_share_lock` проверяют общий runtime, background/Back/cancel и отсутствие late-result. `model_failure_keeps_local_explanation` сохраняет доступное правило; XP/attemptCount до и после одинаковы.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarExplanation.test.ts test/ui/grammarExplanation.test.tsx`.
- [ ] **Реализовать context/prompts/screen:** получить только принятую ошибочную попытку активного профиля; отобразить сохранённый ответ/эталон/контекст/локальное правило. Дополнительную генерацию запускать по кнопке «Объяснить подробнее» с maxTokens=256. Добавить grammar-error в существующий dispatch AssistantService, копирование запроса и guards; не выполнять `wordIds` cloning для grammar-error. Общие epoch/active/draining/cancellation сохраняются; никакого второго runtime. При отсутствии модели оставить правило и необязательную «Настроить модель». Объяснение не создаёт Aid, оцениваемый вопрос или rewards.
- [ ] **GREEN:** команда RED плюс `test/integration/assistant.test.ts`, `test/integration/difficultPractice.test.ts`, `test/ui/errorExplanation.test.tsx`; typecheck. Существующие word explanation/cloze/difficult остаются рабочими.
- [ ] **Commit:** относящиеся hunks строки 7; `git commit -m "feat: explain grammar errors with offline rules"`.

### Task 8: Четыре Android-блока и проверяемые доказательства

**Files:** строка 8 карты. **Consumes:** UI IDs задачи 6, backup v2 задачи 4, grammar-error задачи 7. **Produces:** новые обязательные строки e2e/matrix.json и проверки в существующих `scenarioIdsForBlock`, `verifyScenarioState`, `validateRegressionReport`; новый экспорт `validateBlockRegressionReport(report,block):{ok:boolean;errors:string[]}` в `regression-report.mjs`. Runner принимает дополнительно `--grammar-fixture <v2.json>` и `--grammar-previous-apk <sqlite-v5.apk>`, сохраняя `--fixture` и `--previous-apk` для прежних сценариев. Файл v1 нужен старому приложению; не заменять его новым экспортом v2.

`createRegressionBackup(today:DayKey):Promise<BackupV1>` сохраняет прежнюю сигнатуру: только в host generator экспорт с пустым grammar явно преобразуется в v1 и проходит validateBackupV1. Новый `createGrammarRegressionBackup(today:DayKey):Promise<BackupV2>` в том же файле создаёт отдельные профили для 18 целей, ошибки на 19, повторений, двух сессий и backup roundtrip через настоящие сервисы. Сборщики fixtures используют соответственно `REGRESSION_FIXTURE_OUTPUT` и `GRAMMAR_FIXTURE_OUTPUT`, общий `REGRESSION_FIXTURE_DAY`.

Новый `scripts/review-regression-report.mjs --report <report.json> --observations <observations.json>` завершает проверку уже собранных артефактов без повторного запуска приложения. Runner записывает runId UUID; observations содержит тот же runId, apkSha256, modelSha256, прежние audioAudible/languageQuality/languageNotes/tts и ссылки на просмотренные артефакты этого отчёта. Review CLI проверяет привязку, сохраняет observations, снимает только отсутствие пользовательских наблюдений и вызывает полный либо block validator. Любые failed сценарии, неверные SHA, отсутствующие state/JUnit/model evidence и прочие blockers остаются отказом; нельзя превратить failure в passed редактированием observations.

| Блок | Обязательные check IDs | Доказательство |
| --- | --- | --- |
| grammar-core | `grammar-core.pronouns-sein-choice`, `.typing-case-context`, `.reference-no-xp`, `.empty-dictionary-fallback`, `.keyboard-320dp` | Реальные UI-ответы для всех 18 целей, в том числе sie/Sie в двух позициях; XML/скриншот при 320 dp/fontScale 1.5 и клавиатуре |
| grammar-progress | `grammar-progress.twenty-ui-answers`, `.nineteen-error`, `.bonus-once-double-submit`, `.reviews-difficult`, `.combined-summary` | 20 реальных правильных UI-ответов одной цели; SQLite streak/mastery/250 XP/один бонус, ошибка на 19; все интервалы через проверенные fixtures |
| grammar-persistence | `grammar-persistence.profile-isolation`, `.force-stop-reboot`, `.word-dependency-edit`, `.sqlite-five-six-upgrade` | Два профиля и два независимых блока, восстановление unanswered и feedback, stale без штрафа, реальный upgrade с v5 APK |
| grammar-transfer-assistant | `grammar-transfer-assistant.v1-v2-roundtrip`, `.invalid-backup-atomicity`, `.no-model-rule`, `.real-model-cancel` | Импорт реальным picker, remapped ссылки и combined ledger, malformed отклонён целиком; отсутствие модели и реальная llama.rn генерация/отмена |

- [ ] **RED для harness:** `grammar_matrix_requires_all_four_blocks`, `grammar_state_checks_semantic_target_and_joint_ledger`, `grammar_report_rejects_missing_case_or_model_evidence`, `grammar_runner_rejects_missing_v2_or_v5_inputs`, `legacy_v1_fixture_remains_readable`, `observation_review_cannot_override_failed_scenarios`, `observation_review_rejects_other_run_or_sha`. Удаление любого check/state artifact/SHA/matching generation из отчёта должно давать failed/not-verified; пустой текст модели, одни screenshots без SQLite и skipped JUnit не проходят.
- [ ] **Проверить RED:** `./scripts/toolchain.sh npm run test:scripts`; `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarRegressionFixtures.test.ts`.
- [ ] **Реализовать flows/fixtures/runner:** добавить новый v2 файл отдельно от legacy v1 fixture; его профильные состояния проверяются обычным backup validator. Для UI-сценариев использовать picker/кнопки и state-export, не SQL-записи вместо ответов. Driver выполняет устройства/часы/upgrade prerequisites отдельного блока, восстанавливает display/network/model после теста даже при failure. Проверки grammar-required работают в block mode и full mode; grammar_error generation добавляется к имеющимся четырём реальным режимам помощника. Привязать языковые наблюдения к текущим APK/model SHA и артефактам; не копировать старые review отметки на новый текст. Force-stop/reboot/upgrade — в отдельной AVD/phase, не на подключённом пользовательском телефоне.
- [ ] **GREEN:** повторить RED. `REGRESSION_FIXTURE_OUTPUT=/Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/fixtures/regression-backup.json ./scripts/toolchain.sh npm run fixtures:android` пишет валидную v1 fixture. `GRAMMAR_FIXTURE_OUTPUT=/Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/fixtures/grammar-backup-v2.json ./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/grammarRegressionFixtures.test.ts` пишет проверенную v2 fixture; обе реально существуют и имеют нужную version. Preflight не считается Android-регрессией.
- [ ] **Commit:** hunks строки 8; `git commit -m "test: add grammar Android regression blocks"`.

### Task 9: Release APK, блоки и полный регресс

**Files:** строка 9 карты. **Consumes:** завершённые задачи 1–8, исходные APK/fixtures и реальные model файлы. **Produces:** один release APK, отчёты четырёх новых и всех старых блоков, проверенный полный отчёт на этом же APK.

- [ ] **Проверить весь код:** `./scripts/toolchain.sh npm test -- --runInBand`; `./scripts/toolchain.sh npm run test:scripts`; `./scripts/toolchain.sh npm run typecheck`; `./scripts/toolchain.sh npm run lint`. Все команды exit 0; фиксировать точное число тестов после выполнения, не обещать число заранее.
- [ ] **Провести code review:** использовать superpowers:requesting-code-review; проверить spec coverage, транзакции/ссылки/навигацию и сохранение старых изменений. Исправления проходят отдельный RED/GREEN и повтор затронутых проверок.
- [ ] **Собрать:** `VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android`; APK `android/app/build/outputs/apk/release/app-release.apk`. Проверить отсутствие INTERNET, тот же applicationId/signing, SHA256 APK и provenance исходных APK. Не переустанавливать его на личный телефон в рамках этой задачи.
- [ ] **Пройти каждый новый блок отдельно** следующей командой, меняя BLOCK на `grammar-core`, `grammar-progress`, `grammar-persistence`, `grammar-transfer-assistant`. Все Android/ADB/emulator операции запускать с требуемыми host permissions; не обходить ошибку доступа фальшивой отметкой passed.

```bash
./scripts/toolchain.sh npm run test:android:regression -- \
  --block BLOCK \
  --apk "$PWD/android/app/build/outputs/apk/release/app-release.apk" \
  --model-dir /Users/anton/Documents/Codex/2026-10-03/j/work/model-preparation \
  --avd GermanVocabulary_API36 \
  --previous-apk /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/upgrade-source/task5-app-release.apk \
  --grammar-previous-apk /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar-upgrade-source/app-release.apk \
  --fixture /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/fixtures/regression-backup.json \
  --grammar-fixture /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/fixtures/grammar-backup-v2.json \
  --observations /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar/BLOCK/observations.json \
  --report-dir /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar/BLOCK
```

Для нового прогона не использовать observations от другого runId. Первый прогон создаёт evidence для языковой/визуальной проверки; отсутствие необходимых observations означает not-verified. После реального просмотра заполнить файл observations указанного блока с привязкой к runId/артефактам/SHA; выполнить `./scripts/toolchain.sh node scripts/review-regression-report.mjs --report /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar/BLOCK/report.json --observations /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar/BLOCK/observations.json`. Проверить немецкие примеры и русские переводы всех шаблонов, а также реальный модельный вывод. Успех: exit 0, block status=passed, все его checks passed и SQLite state assertions подтверждены.
- [ ] **Пройти все прежние блоки** тем же runner с `--block`: first-launch, profiles, dictionary, learning, reviews, progress, audio, reminders, assistant, transfer, persistence-force-stop, persistence-reboot, upgrade, resilience. Изменения hub не должны ломать словарные flows. Для известного сбоя old-APK setup сначала воспроизвести и диагностировать с superpowers:systematic-debugging, затем исправить только доказанную причину и повторить upgrade; не ослаблять asserts и не считать прежний отчёт подтверждением новой версии.
- [ ] **Пройти полный регресс:** повторить команду без `--block`, заменить BLOCK на `full` в report-dir/observations. Он выполняет старые и новые сценарии заново последовательно; отчёт не склеивается из отдельных блоков. Просмотреть артефакты этого полного runId, записать его observations и выполнить review CLI с `--report .../grammar/full/report.json --observations .../grammar/full/observations.json` по образцу выше. Затем `./scripts/toolchain.sh node scripts/regression-report.mjs /Users/anton/Documents/Codex/2026-10-03/j/work/android-regression/grammar/full/report.json` возвращает `{ok:true,errors:[]}`.
- [ ] **Зафиксировать приёмку:** в плане отметить выполненные задачи и ссылки на JUnit/state/screenshots/hierarchy/logcat/полный отчёт, число пройденных тестов и SHA APK. `blocked`, `skipped`, `not-verified`, неустранённый failure или отсутствие model/offline evidence означает, что релизная приёмка не пройдена. После любого изменения продукта пересобрать APK, повторить затронутые блоки и полный финальный прогон.
- [ ] **Commit документации:** только относящиеся изменения плана/матрицы и provenance; большие модели/временные артефакты не коммитить. `git commit -m "docs: record grammar regression acceptance"`.

## Самопроверка плана

Соответствие spec: содержание/регистр/персональные примеры — 1; SQLite/очереди/stale/resume — 2; правила/идемпотентность/изоляция — 3; v1/v2/combined ledger — 4; статистика — 5; UX/справочник/два блока — 6; локальные/model объяснения — 7; четыре Android-блока и доказательства — 8; старые блоки и полный release регресс — 9. Все пять Review Focus закреплены тестами. Продуктовые изменения не выполнялись при составлении этого плана.
