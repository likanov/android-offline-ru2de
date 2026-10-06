# Assistant Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, preserving the user's multi process preference. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить объяснение конкретной ошибки, предложения с пропуском и дополнительную практику трудных слов с локальной моделью.

**Architecture:** Расширить существующий AssistantService новым методом генерации практики с общей блокировкой runtime, отменой и проверкой профиля/редакций. Правильность основной попытки и эталоны упражнений определяются приложением; модель создаёт короткий текст. Фактический ответ основной попытки сохраняется в существующем JSON результата SQLite, упражнения остаются временным состоянием отдельного экрана.

**Tech Stack:** React Native 0.85.3, React 19.2.3, Expo 56.0.23, expo-sqlite 56.0.6, TypeScript, Jest, React Native Testing Library, Maestro, llama.rn 0.12.9, существующий GGUF Qwen3-1.7B-Q4_K_M.

**Spec:** [Дополнительная практика](../specs/2026-10-04-assistant-practice-design.md). **Зависимость:** [план исправления UI](2026-10-04-learning-ui-improvements.md), особенно задачи 1–3 и 8. Сначала закрыть основной сценарий UI; затем выполнить этот отдельный этап и повторить полную регрессию.

**Статус:** Добавлено в план по запросу пользователя. Код, новые тесты и аппаратная приёмка ещё не выполнены. Пути исходников отсчитываются от корня `outputs/german-vocabulary`.

## Global Constraints

- Полностью офлайн; каждый профиль имеет отдельный словарь и прогресс. Генерация получает только принадлежащие активному профилю слова.
- 20 правильных подряд; ошибка до освоения сбрасывает серию. Интервалы повторения 1, 3, 7, 14, 30, 60 дней; ошибка назначает завтра без отмены первого освоения.
- 3 ошибки делают слово трудным; 3 правильных подряд в обычном обучении снимают статус. +10 XP за правильный ответ; +50 XP только за первое освоение; уровень каждые 500 XP.
- Новая дополнительная практика не вызывает AnswerService.submit и не пишет attempts, rewards, word_progress, daily_activity или skill_history. Видимая подпись: «Практика без XP и изменения серии».
- Только слово в исходной форме, один пропуск, A1; проверка через checkAnswer. Полные предложения, свободные ответы и новые режимы пропусков артиклей в этот этап не входят.
- submittedAnswer необязателен для старых JSON; не менять таблицы, applicationId `com.personal.germanvocabulary`, BackupV1 и старые HelpMode/assistant-aid-v1.
- Новые функции используют общий BUSY/AbortSignal/profileSelectionVersion/dependencies; при AppState background отмена и release. Нет автоматического фонового запуска модели.
- Сохранённые основной результат, XP и серия переживают перезапуск. Состояние новой практики временное; пользователь видит это до запуска.
- Сохранить существующие testID и всю обязательную регрессионную матрицу; расширить её новой группой. Проверки с runtime-заглушкой не заменяют языковую приёмку.

## Review Focus

1. Старые результаты и резервные копии без submittedAnswer читаются без выдуманного ответа; длинная строка не раздувает контекст — задача 1.
2. Двойная отправка с другим текстом возвращает первый принятый ответ, результат и XP — задача 1.
3. Поздняя генерация после смены профиля, лексического редактирования или background не появляется на экране — задачи 1–3.
4. Невалидный/оборванный JSON, отсутствующее слово и грамматически неверная фраза не превращаются в подтверждённое изучение — задачи 2 и 4.
5. Пустой список трудных слов и слово с будущей датой повторения не создают обычное занятие и не меняют расписание — задачи 3 и 4.

## Карта файлов и порядок

| Файлы | Ответственность |
| --- | --- |
| `src/features/learning/questionTypes.ts`, `answerService.ts` | Необязательный сохранённый submittedAnswer в AttemptResult. |
| `src/features/transfer/backupValidation.ts` | Проверка нового необязательного поля без отказа старым копиям. |
| `src/features/assistant/practiceTypes.ts`, `practiceContext.ts`, `practicePrompts.ts`, `practiceValidation.ts` | Новые контракты, доверенные данные попытки/карточек, запрос модели и проверка её результата. |
| `src/features/assistant/assistantService.ts`, `src/app/AppServices.ts` | Единая очередь генерации старых/новых режимов и доступ к сервису. |
| `src/features/assistant/ErrorExplanationScreen.tsx`, `PracticeScreen.tsx` | Экран разбора ошибки и временная практика с пропусками. |
| `src/features/assistant/difficultPracticeRepository.ts`, `src/features/reviews/DifficultWordsScreen.tsx` | Чтение трудных слов профиля и вход в дополнительную практику. |
| `src/app/navigation.tsx`, `src/features/learning/TrainingScreen.tsx`, `src/features/dictionary/WordCardScreen.tsx` | Новые входы и возврат к тому же принятому результату. |
| `test/`, `e2e/`, `scripts/`, `docs/model-evaluation.md` | TDD, полная регрессия и проверка качества реальных генераций. |

Порядок 1 → 2 → 3 → 4. Общие AssistantService, типы и navigation имеют одного исполнителя на этапе интеграции. После фиксации контрактов допустимо параллельно готовить независимые проверки качества и тестовые данные; одним эмулятором управляет один исполнитель. Подготовка плана не запускает агентов.

## Общий цикл

- [ ] Прочитать инструкции, исходный UI-план и spec; проверить рабочее дерево и подходящий изолированный checkout. Сохранить прежние изменения, не сбрасывать diff.
- [ ] В каждой задаче сначала написать названные тесты, выполнить команду и подтвердить RED на ожидаемом утверждении; затем минимальная реализация, GREEN, рефакторинг и целевой commit. Не включать чужие файлы.
- [ ] После каждой задачи выполнять typecheck и целевые тесты. Общая команда: `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath <перечисленные файлы>`; GREEN — код 0, без пропусков. Typecheck: `./scripts/toolchain.sh npm run typecheck`.

### Задача 1 Разбор сохранённой ошибки и общая генерация

**Files:** Modify `src/features/learning/questionTypes.ts`, `answerService.ts`, `TrainingScreen.tsx`, `src/features/transfer/backupValidation.ts`, `src/features/assistant/assistantService.ts`, `src/app/navigation.tsx`, `AppServices.ts`; Create `src/features/assistant/practiceTypes.ts`, `practiceContext.ts`, `practicePrompts.ts`, `ErrorExplanationScreen.tsx`, `test/unit/practiceContext.test.ts`, `test/integration/assistantPractice.test.ts`, `test/ui/errorExplanation.test.tsx`; Modify `test/integration/answers.test.ts`, `backup.test.ts`, `test/ui/training.test.tsx`.

**Interfaces:**

```ts
// Дополнение существующего AttemptResult; исходные поля сохраняются.
submittedAnswer?: string;

// practiceTypes.ts; WordRevision из assistantTypes.ts.
type PracticeRequest =
  | { kind: 'error'; profileId: string; attemptId: string }
  | { kind: 'cloze'; profileId: string; wordIds: string[] }
  | { kind: 'difficult'; profileId: string; wordIds: string[] };
type ErrorExplanation = {
  kind: 'error'; profileId: string; attemptId: string;
  submittedAnswer: string | null; expected: string[];
  text: string; referenceTitle: string | null;
};
type ClozeExercise = {
  wordId: string; revision: number; before: string; after: string;
  expected: string[]; sentenceDe: string; translationRu: string;
};
type ClozePractice = {
  kind: 'cloze' | 'difficult'; profileId: string;
  exercises: ClozeExercise[]; dependencies: WordRevision[];
};
type PracticeResult = ErrorExplanation | ClozePractice;
// Метод существующего AssistantService:
generatePractice(request: PracticeRequest, signal: AbortSignal,
  onText: (text: string) => void): Promise<PracticeResult>;
```

`practiceContext.ts` экспортирует `readErrorContext(db: SqlStore, profileId: string, attemptId: string): Promise<ErrorContext>`. `ErrorContext` включает `question: Question`, `result: AttemptResult`, `word: Word`, `reference: {title: string; text: string} | null`. Читает attempts + questions + words одним снимком, допускает только принятую неправильную попытку текущей редакции и активного профиля. Сохранённый expected, а не output модели, попадает в экран.

- [ ] RED: `accepted_answer_survives_resume_and_backup` проверяет ошибочный ввод с ä/ß, force-stop через пересоздание сервисов и export/restore JSON. `old_result_without_answer_is_readable` импортирует исходную BackupV1 без поля и ожидает submittedAnswer null в контексте. `duplicate_submit_preserves_first_answer` повторяет один attemptId с другим текстом: ответ, XP и число attempts неизменны.
- [ ] RED: `error_context_rejects_foreign_unanswered_correct_and_stale_attempts` проверяет четыре отказа; `explanation_uses_saved_expected_and_never_regrades` подставляет вывод модели «ответ верный», но исходный экран сохраняет ошибку и правильный эталон. `long_answer_is_bounded_in_model_context` проверяет передачу первых 500 символов с явным признаком усечения; исходный сохранённый ответ не обрезается.
- [ ] GREEN: сохранить первоначальную строку answer как submittedAnswer в result JSON после принятия основной попытки. У дубля вернуть old.result. В BackupV1 валидировать поле при наличии как string; сохранять его через экспорт, remap и restore без новой таблицы. Для старой попытки экран показывает «Ответ не сохранён»; промпт запрещает предполагать её содержание.
- [ ] GREEN: generatePractice использует ту же active-блокировку, epoch, проверку profileSelectionVersion, отмену/release и runtime, что generate; передать JSON как данные, 256 maxTokens для объяснения. Правила только из reference для gender/articles; текст модели помечен как объяснение помощника. Не расширять HelpMode и формат aids.
- [ ] RED → GREEN UI: `wrong_feedback_opens_explanation_and_returns_unchanged` проверяет кнопку «Объяснить ошибку», сохранённый текст, отмену и возврат к тому же attemptId. `late_error_explanation_is_discarded` проверяет смену профиля/редакции/background. `old_attempt_explains_correct_variant_without_claiming_user_answer` проверяет старый результат. При отсутствии модели есть установка и возврат к обучению.
- [ ] Выполнить все указанные новые и изменённые тесты и `test/integration/assistant.test.ts`, typecheck; commit `feat: explain committed learning errors offline`.

### Задача 2 Предложения с одним пропуском

**Files:** Modify `src/features/assistant/practiceContext.ts`, `practicePrompts.ts`, `assistantService.ts`, `src/features/dictionary/WordCardScreen.tsx`, `src/app/navigation.tsx`; Create `src/features/assistant/practiceValidation.ts`, `PracticeScreen.tsx`, `test/unit/practiceValidation.test.ts`, `test/ui/practice.test.tsx`; Modify `test/integration/assistantPractice.test.ts`.

**Interfaces:** Использует PracticeRequest/PracticeResult задачи 1. Добавить `readClozeWords(db: SqlStore, profileId: string, wordIds: string[]): Promise<Word[]>` (1–5 уникальных слов в порядке запроса). `decodeClozeOutput(raw: string, words: Word[]): ClozeExercise[]` проверяет строгий JSON `{exercises:[{wordId,before,after,translationRu}]}`. `gradeCloze(exercise: ClozeExercise, answer: string): boolean` вызывает checkAnswer. Props PracticeScreen: `{db: SqlStore; profileId: string; request: Extract<PracticeRequest,{kind:'cloze'|'difficult'}>; onBack: () => void}`.

- [ ] RED: `cloze_expected_comes_only_from_owned_card` проверяет expected `[word.de]` независимо от полей ответа модели. `cloze_rejects_partial_json_duplicates_unknown_or_missing_ids` покрывает повреждённый JSON, повторы и неполный набор. `cloze_rejects_answer_leak_in_context` отклоняет целевое слово в before/after как отдельное слово после NFC/регистра; для многословной карточки — полную целевую фразу.
- [ ] GREEN: модель генерирует before/after вокруг одного вхождения исходной формы слова и translationRu. Декодер требует ровно один элемент на переданный ID, строковые поля, непустой контекст и перевод; before+after не более 240 символов, перевод не более 300. Не принимать поле expected от модели. sentenceDe собирается приложением из before, word.de, after; отображаемый prompt содержит один «___» на месте слова. Сохранять пробелы before/after при сборке, проверять их тестом. 512 maxTokens; валидировать только законченный результат, не поток.
- [ ] RED: `cloze_grade_preserves_umlauts_and_eszett` проверяет ä/ö/ü/ß, NFC, регистр, пробелы и отказ ae/ss вместо точного эталона. `cloze_generation_rejects_changed_revision` редактирует слово во время генерации. `practice_does_not_write_learning_tables` сравнивает все learning/XP/daily/skill таблицы до/после ответов и повторного открытия.
- [ ] GREEN: на карточке добавить «Практика с пропуском» с wordIds `[word.id]`. Экран показывает инструкцию «Вставьте немецкое слово», видимое поле и существующие немецкие клавиши; артикль/цвет/иконку целевой карточки не выводить до ответа. Перевод скрыт до «Показать перевод» или принятого ответа. Подсказка не раскрывает само немецкое слово.
- [ ] RED → GREEN UI: `practice_reveals_sentence_only_after_submit`, `practice_translation_hint_is_marked`, `double_submit_counts_once`, `cancelled_generation_keeps_return_available`, `invalid_generation_offers_retry_without_partial_exercise`. После ответа результат заблокирован от правки, показывает эталон, полную фразу, перевод и «Дальше»; итог только локальные correct/errors. Выход сбрасывает практику с видимым пояснением до запуска.
- [ ] Выполнить новые тесты, assistantPractice, `test/unit/normalizeAnswer.test.ts`, typecheck; commit `feat: add local cloze vocabulary practice`.

### Задача 3 Дополнительная практика трудных слов

**Files:** Create `src/features/assistant/difficultPracticeRepository.ts`, `test/integration/difficultPractice.test.ts`; Modify `src/features/assistant/practiceContext.ts`, `assistantService.ts`, `PracticeScreen.tsx`, `src/features/reviews/DifficultWordsScreen.tsx`, `src/app/navigation.tsx`, `test/ui/reviews.test.tsx`, `test/ui/practice.test.tsx`.

**Interfaces:** `DifficultPracticeRepository(db: SqlStore).select(profileId: string): Promise<Word[]>` читает words JOIN word_progress с одинаковым profileId, difficult=1, ORDER BY de,id LIMIT 5. Метод generatePractice для kind difficult сам читает этот набор и сравнивает его упорядоченные ID с request.wordIds из предпросмотра; при изменении набора экран предлагает обновить список. Та же ClozePractice и gradeCloze задачи 2; не создавать Session и не обходить eligible обычного обучения.

- [ ] RED: `difficult_selection_is_owned_flagged_ordered_and_bounded` проверяет два профиля, ≥6 трудных слов, лимит 5 и порядок. `future_review_word_can_be_practised_without_rescheduling` проверяет mastered=true и будущий dueDay. `empty_difficult_pool_does_not_call_runtime` ожидает 0 генераций/сессий.
- [ ] GREEN: кнопка «Практика с помощником» на DifficultWordsScreen открывает предпросмотр выбранных слов и предупреждение о временном результате без XP/серии. «Начать практику» вызывает kind difficult; старые кнопки study/review остаются. Нет трудных слов — пояснение и «В словарь». При невалидном результате весь набор не запускается, доступен повторный запрос.
- [ ] RED → GREEN: `practice_three_correct_does_not_clear_difficult` и `practice_three_errors_does_not_change_recovery` сравнивают исходные flags/counters/streak/XP/dueDay. `normal_training_still_recovers_after_three_correct` подтверждает исходное правило через AnswerService, а не через практику. `profile_switch_clears_practice_and_counts` отклоняет поздний output и локальные ответы чужого профиля. `changed_difficult_pool_requires_refresh` проверяет статус, изменившийся между предпросмотром и генерацией.
- [ ] Выполнить difficultPractice, practice, reviews, `test/integration/reviews.test.ts`, `test/unit/learningRules.test.ts`; typecheck. Commit `feat: practise difficult vocabulary without changing schedules`.

### Задача 4 Приёмка реальной модели и полная Android-регрессия

**Files:** Create `e2e/assistant-practice.yaml`, `e2e/checks/assistant-practice.error-explanation.yaml`, `assistant-practice.cloze-answer.yaml`, `assistant-practice.difficult-isolation.yaml`, `assistant-practice.cancel-offline.yaml`, `assistant-practice.legacy-restore.yaml`, `docs/assistant-practice-regression.md`; Modify `e2e/matrix.json`, `e2e/config.yaml`, `scripts/emulator-regression.mjs`, `regression-state.mjs`, `regression-evidence.mjs`, `test/scripts/regressionFlows.test.mjs`, `regressionState.test.mjs`, `regressionEvidence.test.mjs`, `src/features/assistant/PracticeScreen.tsx` (стабильные testID), `docs/model-evaluation.md`.

**Interfaces:** Новая обязательная группа `assistant-practice` из пяти checks выше. Состояние до/после сверять обычным BackupV1 export. Набор качества расширить на 30 фиксированных случаев: 10 объяснений ошибок, 10 пропусков и 10 наборов трудных слов; прежние 40 остаются обязательными. Отчёт содержит actual output, профиль/карточки/референс, APK/model SHA-256, вердикт и причину.

- [ ] RED → GREEN: runner отклоняет отсутствующий flow/JUnit/state evidence для новой группы. Добавить testID `error-explanation-open`, `error-explanation-text`, `practice-start`, `practice-input`, `practice-submit`, `practice-next`, `practice-summary`, `difficult-practice-open`; не менять старые ID.
- [ ] Пройти на release APK с настоящим GGUF и отключённой сетью: ошибка → объяснение → тот же результат → перезапуск → тот же введённый ответ; карточка → пропуск → правильный/неправильный ответ → перевод/итог; трудные → будущая дата → практика → без изменений прогресса. Проверить отмену, background, смену профиля и редактирование карточки во время генерации.
- [ ] Сравнить до/после XML/UI и export BackupV1: XP, attempts, rewards, word_progress, daily_activity, skill_history не меняются от практики. Обновить APK поверх предыдущего с той же подписью; импортировать настоящую старую копию без submittedAnswer. Не выдавать синтетический UI или runtime-заглушку за проверку полной версии.
- [ ] Проверить новые экраны на 360 × 640 dp/font 1.0 и 320 dp/font 1.5, длинные ответы, закреплённую клавиатуру, TalkBack и области нажатия ≥48 dp. Подсказка и правильный ответ имеют текстовые подписи, не различаются только цветом.
- [ ] Провести 30 новых языковых случаев реальной моделью. Для каждой функции требуется ≥9/10 пригодных результатов, без неверного целевого артикля, противоречия встроенному справочнику или выдуманного ответа старой попытки во всём наборе. Для пропусков оценить грамматику собранной sentenceDe, точность перевода и единственность предлагаемого эталона; структурная валидация отдельно. Повреждённый JSON — непригодный результат, не пропуск случая. Прежние 40 также пройти; при провале кандидата доработать промпт/модель и повторить фиксированный набор.
- [ ] Выполнить `npm test`, `test:scripts`, `typecheck`, `lint`, `build:android` через scripts/toolchain.sh. Повторить всю обязательную матрицу командой из основного UI-плана, с новым report-dir и observations для этой сборки. Успех требует exit 0 и evidence; незавершённые старые проверки не исключать.
- [ ] Заполнить docs/assistant-practice-regression.md фактическими результатами и ограничениями. На Pixel 9 Pro XL отдельно измерить загрузку, время первого токена, полный ответ и память; отсутствие физического устройства оставить как непроверенное. Commit `test: verify offline assistant practice on Android`.

## Критерии завершения

- Все три функции доступны через компактные вторичные действия и работают офлайн с настоящей моделью.
- Объяснение использует сохранённую попытку; возврат/перезапуск/backup сохраняют первичный результат и XP, старые JSON читаются.
- Пропуски проверяются приложением, дополнительная практика не меняет ни одного учебного показателя. Обычные 20 подряд, 3 ошибки/3 правильных и интервалы продолжают проходить исходные тесты.
- Профили, отмена, отсутствие модели, ошибки генерации и крупный шрифт подтверждены тестами и эмулятором.
- Успешны host-проверки, полная обязательная Android-матрица и 70 языковых случаев по правилам выше. Не проверенные аппаратные показатели явно указаны.

## Самопроверка плана

Spec покрыт: объяснение и ответ — задача 1; пропуски/валидация/отсутствие XP — 2; трудные/будущие даты/пустой набор — 3; регрессия и качество — 4. Все пять Review Focus имеют названные тесты. Существующие aids и четыре функции не меняют формат; новый result JSON совместим со старой BackupV1. Новая очередь общая с AssistantService, а проверка упражнения независима от модели. Новые задачи не отмечены выполненными.
