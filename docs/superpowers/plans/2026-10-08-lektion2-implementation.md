# Lektion 2: профессии, местоимения и вопросы Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Включить все задания 2.9–2.14 в пять видов практики с отдельным прогрессом 24 целей.

**Architecture:** После этапа словаря используется схема 7 и backup 3. Каталог 1 и его payload остаются неизменными; каталог 2 содержит доверенные локальные шаблоны и новые ответы предложением. Миграция 7 → 8 расширяет ограничения, не сбрасывая существующие занятия.

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

- Начальное Sie не доказывает вежливость: контекст обязан различать «они» и «Вы» — G1/G2.
- Вставленный в backup payload с изменённым ожидаемым ответом не становится правильным — G2/G4.
- Двойное нажатие после возобновления не удваивает XP/бонус — G3.
- Пустой или изменённый личный словарь не меняет ключи нового учебного банка — G2/G3.
- Полное предложение остаётся видимым при клавиатуре, большом шрифте и возврате из помощника — G5 и R2.

---

### G1. Учебный банк и типы каталога 2

**Files:** создать `src/features/grammar/lektion2Content.ts`, `test/unit/lektion2Content.test.ts`; изменить `grammarTypes.ts`, `grammarCatalog.ts` в той же директории и `test/unit/grammarCatalog.test.ts`. Вход: `docs/superpowers/specs/2026-10-08-lektion-2-exercise-content.md`.

**Interfaces:** переименовать исходный тип вопроса в `LegacyGrammarQuestion` без изменения полей и сериализации. Добавить `Lektion2TargetId` с пятью семействами из спецификации; `GrammarTargetId = LegacyGrammarTargetId | Lektion2TargetId`; `GrammarCatalogVersion = 1|2`. Legacy-массив `grammarTargets` до G3 остаётся прежним; новый `lektion2Targets` регистрируется отдельно, чтобы старые сессии не увидели новые цели до готовности хранилища. Новые kind: `professions-pronoun`, `professions-sein`, `demonstrative-statement`, `yesno-transform`, `yesno-translation`. `Lektion2Template` содержит `{id,sourceExercise,sourceItem,targetId,promptRu,contextRu,beforeDe,afterDe,sentenceDe,translationRu,ruleId,explanationRu,answers}`. `sourceItem: number|null`, null для дополнительного образца; `answers: readonly string[]`. Все строки заданы явно, а не сгенерированы языковой моделью.

`GrammarTarget` становится union legacy target и new target с catalogVersion=2 и nullable pronounId. Новые правила: `profession-predicate`, `demonstratives-nominative`, `yesno-word-order`, плюс прежние два. `GrammarLesson` сохраняет `mixed|pronouns|sein` и добавляет пять новых kind. `getGrammarTarget(id: GrammarTargetId): GrammarTarget`; `getGrammarVariantCount(id: GrammarTargetId): number`; `getGrammarCatalogVersions(): (1|2)[]`. Legacy mixed означает только прежние 18 целей.

- [ ] Тесты `legacy_catalog_is_unchanged`, `lektion2_has_24_targets_and_complete_source_coverage`, `every_target_has_contextual_variants`. Зафиксировать старые 18 IDs/версии; новые 24 IDs (7+7+2+2+6); источники 2.10–2.14 покрывают 8/10/8/11/20 уникальных sourceItem, 2.9 — 42 сочетания, плюс Buch. Каждый шаблон имеет уникальный id, объяснение и правильное согласование sein. Разные контексты «они»/«Вы» при одинаковой строке не теряются при дедупликации.
- [ ] `npm test -- --runInBand --runTestsByPath test/unit/grammarCatalog.test.ts test/unit/lektion2Content.test.ts` → RED.
- [ ] Перенести весь согласованный материал в readonly bank. Семь лиц: ich, du, er, wir, ihr, sie_plural, sie_formal. Для 2.14 №9–12 создать варианты контекста ihr и Sie. Для 2.13 начальное Sie получает явно заданное «они»; дополнительные вежливые варианты имеют отдельные templateId. Дополнить недостающие варианты всех 7 целей профессиональных местоимений. Контекст не содержит готового немецкого ответа.
- [ ] Повторить тесты и typecheck; PASS. Коммит `feat: add trusted Lektion 2 grammar content and targets`.

### G2. Фабрика вопросов и проверка предложений

**Files:** создать `src/features/grammar/lektion2QuestionFactory.ts`, `grammarSentenceAnswer.ts`, `test/unit/lektion2QuestionFactory.test.ts`, `test/unit/grammarSentenceAnswer.test.ts`; изменить `grammarQuestionFactory.ts`, `grammarChoiceOptions.ts`, `grammarTypes.ts` в той же директории; обновить сужение union в `GrammarQuestionView.tsx`, `GrammarTypedAnswer.tsx`, `src/features/assistant/grammarErrorContext.ts`, `src/features/transfer/grammarBackupValidation.ts`; дополнить `test/ui/grammarTraining.test.tsx` проверкой отображения sentence.

**Interfaces:** `GrammarQuestion = LegacyGrammarQuestion | Lektion2ClozeQuestion | GrammarSentenceQuestion`. Новые cloze имеют catalogVersion=2, `presentation:'cloze'`, прежний expected `{optionId,token}`. Sentence имеет catalogVersion=2, `presentation:'sentence'`, `responseMode:'typed'`, `promptRu`, `sourceSentenceDe:string|null`, `expected:{sentences:string[]}`; общие идентификаторы/feedback/dependencies/даты как прежде. На новой версии dependencies пустой массив. У legacy presentation отсутствует: читать отсутствие как cloze, не переписывать старый payload.

`makeLektion2Question(input: GrammarQuestionInput): Lektion2ClozeQuestion|GrammarSentenceQuestion`; `normalizeGrammarSentence(text: string): string`; `checkGrammarSentence(question: GrammarSentenceQuestion, text: string): boolean`. Общие `makeGrammarQuestion`, `validateGrammarQuestion`, `checkGrammarAnswer` сохраняют API и направляют по catalogVersion/targetId. Для sentence режим typed принудителен независимо от input.responseMode.

- [ ] Тесты `all_templates_roundtrip_through_validation`, `forged_payload_rejected`, `sentences_preserve_internal_case`, `sentence_length_and_whitespace`, `new_choices_are_german_only`. Проверить каждый template/answer; замены expected/context/templateId/version отклоняются; все отвлекающие варианты неправильные при данном контексте; карточки работают с `words:[]`.

```ts
expect(normalizeGrammarSentence('  sind   Sie Designer?  ')).toBe('sind Sie Designer');
expect(normalizeGrammarSentence('Sind sie Designer.')).toBe('sind sie Designer');
// Для цели sie_formal:
expect(checkGrammarSentence(formalQuestion, 'Sind Sie Designer?')).toBe(true);
expect(checkGrammarSentence(formalQuestion, 'Sind sie Designer?')).toBe(false);
```

- [ ] Запустить `npm test -- --runInBand --runTestsByPath test/unit/lektion2QuestionFactory.test.ts test/unit/grammarSentenceAnswer.test.ts test/unit/grammarAnswer.test.ts test/unit/grammarQuestionFactory.test.ts`; подтвердить RED только нового поведения.
- [ ] Реализовать нормализацию NFC, trim, схлопывание пробелов, игнорирование регистра только первого символа и конечных `.?!`. Сохранить внутренний регистр и ä/ö/ü/ß; не использовать словарный normalizeAnswer. Пустой/длиннее 256 символов ввод — validation error без попытки и XP; непустое неверное предложение — обычный неправильный ответ. Ограничение 64 и одно слово остаются у старых вопросов. Проверять новый payload пересозданием шаблона из доверенного банка.
- [ ] В том же коммите адаптировать потребителей расширенного union: для sentence отобразить prompt/sourceSentenceDe и ввод256, для cloze оставить прежний путь; в legacy backup validator явно сузить catalogVersion1 и отклонить version2 до G4. Контекст помощника читает общее feedback, sentence не трактуется как token. Не использовать type assertions для подавления ошибок. Добавить UI-тест видимого sentence prompt и отсутствия искусственного пропуска; G5 расширяет навигацию и приёмку этого базового отображения.
- [ ] Старую фабрику и проверку legacy options оставить доступными только для catalogVersion=1; новые кнопки брать из немецких token. Добавить объяснение ошибки регистра при совпадении без регистра, не меняя итог right=false.
- [ ] Повторить тесты и typecheck до PASS; коммит `feat: grade contextual grammar and full sentence answers offline`.

### G3. Схема 8, выбор урока, прогресс и возобновление

**Files:** создать `src/core/migrations/008_lektion2.ts`, `test/integration/lektion2Migration.test.ts`, `test/integration/lektion2Sessions.test.ts`; изменить `src/core/migrations.ts`, `src/features/grammar/grammarRepository.ts`, `grammarSessionRepository.ts`, `grammarAnswerService.ts`, `grammarProgressRepository.ts`; тесты `test/integration/grammarProgress.test.ts`, `grammarAnswers.test.ts`.

**Interfaces:** `migrateLektion2(tx: SqlExecutor): Promise<void>` использует V1 schemaTransaction; существующие `start(profileId,selection,today)`, `resume(profileId)`, `next(profileId,sessionId,today)` и `submit(profileId,sessionId,attemptId,answer,today)` сохраняются. Добавить `sameGrammarSelection(a: GrammarSelection,b: GrammarSelection): boolean` (mode,lesson,множество targetIds; отсутствие targetIds отличается от конкретного множества).

- [ ] Тесты `migration_preserves_legacy_payload_and_ledger`, `migration8_failure_keeps_version7`, `new_goal_starts_at_zero`, `lesson_selection_cannot_resume_other_lesson`, `duplicate_submit_after_resume_awards_once`, `empty_dictionary_can_finish_lesson`. Снять граф схемы7 со старыми освоенными/активными целями; после 8 старые записи равны. У каждой новой цели initial streak0, у всех24 есть вариант. Один новый target: 19 верных→ошибка→0; 20 верных→mastered и суммарно250XP; повторный submit не добавляет XP; review error сохраняет mastered и dueTomorrow; 3 ошибки/3 верных включают/снимают difficult; проверить все интервалы.
- [ ] Выполнить новые integration-файлы и прежние grammarProgress/grammarAnswers через Jest → RED.
- [ ] Мигрировать ограничения grammar_targets/progress/questions с сохранением остальных таблиц/индексов/связей и legacy JSON. Новые цели catalogVersion2; старые1. ordinal уникальный не ограничен17; variantIndex неотрицательный, верхняя граница определяется банком. Nullable pronounId допускается только новым целям без конкретного лица. Записать user_version8 после FK-проверки.
- [ ] Подключить общий реестр старых18 и новых24 целей, затем убрать SQL-хардкод catalogVersion1 из чтения/записи/проверки свежести, заменив значением зарегистрированной цели. Вариант шагает по `getGrammarVariantCount(targetId)`, старые3 сохраняются. Допускать только цели выбранного урока, старое mixed не включает новые. Применять прежний applyAnswer/ledger, не создавать второй источник XP. Новый bank не зависит от редактируемых слов, legacy dependency checking сохраняется.
- [ ] Повторить целевые тесты, typecheck и полный SQL-блок `npm run test:sql`; PASS. Коммит `feat: persist Lektion 2 grammar sessions and progress`.

### G4. Backup 3 для обоих каталогов

**Files:** изменить `src/features/transfer/grammarBackupValidation.ts`, `backupTypes.ts`, `backupValidation.ts`, `backupService.ts`, `backupRemap.ts`; тесты `test/unit/grammarBackupValidation.test.ts`, `test/integration/grammarBackup.test.ts`; обновить `docs/backup-format.md`.

**Interfaces:** использовать BackupV3 из V3; `catalogVersions:[1,2]` после регистрации G1. Version каждого target/question выводится и проверяется по каталогу, а не доверяется одному полю контейнера. V1/V2 принимают только legacy IDs/payload.

- [ ] Тесты `mixed_catalog_roundtrip_preserves_active_sentence`, `v2_cannot_smuggle_catalog2`, `forged_expected_sentence_rejected`, `unknown_template_rejected_atomically`. Смешанный backup с освоенной старой целью, новой серией19, текущим полным предложением и ненулевыми XP экспортировать и восстановить; сопоставить весь граф после UUID-remap. Изменённые expected, тип урока, catalogVersion, связи попыток/наград должны отклоняться без создания профилей.
- [ ] Запустить `npm test -- --runInBand --runTestsByPath test/unit/grammarBackupValidation.test.ts test/integration/grammarBackup.test.ts` → RED.
- [ ] Расширить только V3 проверку; направлять payload в соответствующий валидатор фабрики, remap только идентификаторов владения/сессии/попытки и legacy word-dependencies. TemplateId/targetId остаются стабильными. Документировать изменения и сохранность legacy.
- [ ] Те же тесты и typecheck → PASS; коммит `feat: roundtrip mixed grammar catalogs in backup v3`.

### G5. Пять видов практики и помощь после ошибки

**Files:** изменить `src/features/learning/TrainingHomeScreen.tsx`, `src/app/navigation.tsx`, `src/features/grammar/GrammarTrainingScreen.tsx`, `GrammarQuestionView.tsx`, `GrammarTypedAnswer.tsx`, `GrammarReferenceScreen.tsx`, `grammarPresentation.ts`; `src/features/assistant/grammarErrorContext.ts`, `grammarErrorPrompts.ts`, `GrammarExplanationScreen.tsx`; тесты `test/ui/grammarTraining.test.tsx`, `grammarNavigation.test.tsx`, `grammarExplanation.test.tsx`, `questionScreen.test.tsx`.

**Interfaces:** новая группа «Lektion 2 · Профессии и вопросы» ведёт в пять GrammarLesson G1. `GrammarTypedAnswer` получает `maxLength?: number` (по умолчанию64; sentence256). QuestionView различает legacy/cloze/sentence по union G2. Навигация передаёт полный GrammarSelection и использует sameGrammarSelection G3 при resume.

- [ ] Тесты `five_lesson_entries_start_correct_selection`, `sentence_prompt_has_no_fake_blank`, `german_only_options_before_feedback`, `help_return_preserves_sentence_input`, `profile_switch_does_not_submit_old_answer`. В sentence показывать инструкцию и при преобразовании исходное предложение; правильное решение скрыто до submit; после ответа перевод/правило/серия доступны. Проверить maxLength256 и немецкие спецсимволы, восстановление текущего задания при возврате из справочника и помощника; UI не начисляет опыт самостоятельно.
- [ ] Запустить четыре UI-файла через Jest → RED.
- [ ] Добавить компактный выбор урока, динамический заголовок вместо постоянного «Местоимения и sein». Сохранить доступность поля и проверки через существующий question-layout. Помощнику передавать typed sentence, проверенное решение и ruleId; объяснение доступно без модели через встроенное правило. Добавить правила profession-predicate, demonstratives-nominative, yesno-word-order в справочник. Не расширять AI-оценивание.
- [ ] Повторить UI-тесты, typecheck и lint → PASS; коммит `feat: expose Lektion 2 grammar practice and feedback`.

**Выход этапа:** схема8, оба каталога, пять видов практики и backup3; перейти к общему плану проверки и установки, не объявлять Android-регресс пройденным по Jest.
