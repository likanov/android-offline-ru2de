# Числа, A1 и Lektion 2 — интеграция и выпуск Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Проверить общий результат по блокам, пройти полный Android-регресс и обновить Pixel 9 Pro XL с импортом в Anton.

**Architecture:** Работа разделена на два самостоятельно проверяемых этапа и общую приёмку. Сначала словарь со схемой7/backup3, затем грамматика со схемой8. Финальный APK один для регресса и установки, все отчёты привязаны к его SHA-256.

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

- Частичный блок или устаревший APK не может дать итоговый full-pass — R1/R2.
- Обновление реальной схемы6 сохраняет обе активные сессии, XP и историю — R1/R2.
- Клавиатура с большим шрифтом закрывает длинный ответ — R2.
- При отсутствии модели/офлайн-голоса основной урок остаётся доступным — R2/R3.
- Повторный импорт на телефоне не увеличивает число слов, награды и XP — R3.

---

## Порядок выполнения и границы параллельной работы

1. [Словарь и числа: V1–V5](2026-10-08-a1-vocabulary-implementation.md).
2. [Грамматика: G1–G5](2026-10-08-lektion2-implementation.md).
3. R1–R3 ниже: тестовая инфраструктура, полный регресс, установка.

Всего 13 задач: пять словарных, пять грамматических, три интеграционные. Пользователь ранее выбрал multi process: сохранить выполнение через subagent-driven-development после проверки этого плана. Общие интерфейсы/миграции/backup выполнять последовательно; независимые учебные данные V5 и G1 можно готовить параллельно только с раздельным владением файлами. Обзоры задач выполняются согласно skill, итоговый review — до сборки.

Host-тесты независимых блоков могут идти параллельно, каждый со своей временной БД/отчётом; не запускать два writer-процесса в одной SQLite. Gradle-сборки последовательны из-за общих native build-каталогов. Maestro одного устройства — строго последовательно. Блочные прогоны не заменяют заключительный полный прогон.

Рабочий каталог всех npm/git-команд:
`/Users/anton/Documents/Codex/2026-10-03/j/work/worktrees/question-screen-ux`.
Артефакты сохранять вне Git в `/Users/anton/Documents/Codex/2026-10-03/j/outputs/a1-lektion2-release/`.
Перед выполнением проверить git status, существующие зависимости и реальные toolchain paths. `scripts/toolchain.sh` вычисляет пути относительно checkout; в worktree они могут отличаться от расположения установленных SDK/JDK/ключа. Использовать существующие явные пути, не создавать новый ключ и не скачивать toolchain автоматически.

### R1. Добавить блоки Android-регресса и проверки доказательств

**Files:** создать `e2e/extended-vocabulary.yaml`, `e2e/grammar-lektion2.yaml`, их checks под `e2e/checks/`; изменить `e2e/matrix.json`, `scripts/emulator-regression.mjs`, `scripts/regression-report.mjs`, `scripts/regression-state.mjs`, `scripts/create-regression-fixtures.ts`, `docs/emulator-regression.md`, `docs/regression-matrix.md`; тесты `test/scripts/regressionFlows.test.mjs`, `regressionState.test.mjs`, `regressionEvidence.test.mjs`, `emulatorRegression.test.mjs`, `test/integration/regressionFixtures.test.ts`.

**Interfaces:** новые BLOCK_IDS из matrix — `extended-vocabulary`, `grammar-lektion2`; запуск через существующий `--block`. В runner добавить `--schema6-apk PATH` для дополнительного обновления 6→8, с проверкой package/сертификата/хэша/provenance. Не заменять прежние original-Task5 и schema5 upgrade-проверки. Catalog2 fixture экспортируется production BackupService V3, legacy fixtures V1/V2 остаются для обратной совместимости.

- [ ] Добавить тесты `new_blocks_have_executable_unique_checks`, `full_report_requires_new_blocks`, `schema6_upgrade_requires_distinct_signed_apk`, `v3_state_comparison_checks_both_catalogs`. `validateRegressionReport` отвергает отсутствующий/пропущенный новый check и другой APK hash; block-pass никогда не считается full-pass. Сравнение графа учитывает новые типы вопросов, обе версии каталога и все награды.
- [ ] `npm run test:scripts` → RED на новых проверках.
- [ ] Добавить реальные Maestro flows: nine-type editor; оба CSV; дубли и темы; поиск Sie/чисел; typed number; пять grammar lessons; правильный/ошибочный sentence; Sie-контекст; восстановление при force-stop/reboot; справочник/помощник; backup3 roundtrip; пустой словарь. Снимки клавиатуры фиксируют prompt/input/submit, а не только факт открытия экрана. Включить новые checks в полный runner, не создавать обход строгого валидатора.
- [ ] Сохранить исходный установленный schema6 APK до пересборки: получить `adb -s 52211FDAS002R5 shell pm path com.personal.germanvocabulary`, скопировать возвращённый APK через adb pull в артефакты, записать package/version/certificate/hash и подтверждённый source provenance. Если связь с исходным коммитом не доказана, отметить provenance непроверенным; не выдумывать его. Для тестового обновления запустить schema6 APK на отдельном upgrade-AVD, создать данные и ответить через UI, экспортировать before, установить final APK поверх и сравнить after. Не подменять private DB файлом с хоста.
- [ ] Создать V3 fixtures через репозитории и реальные submit. Словарь: новая часть речи и существующий освоенный дубль; грамматика: старая освоенная цель, новая серия19, несколько review-дней и активный sentence. Имена профилей регресса уникальны, original fixtures неизменны. Новые блоки импортируют нужный fixture через picker.
- [ ] `npm run test:scripts` и `npm test -- --runInBand --runTestsByPath test/integration/regressionFixtures.test.ts` → PASS; коммит `test: cover extended vocabulary and Lektion 2 Android regression`.

### R2. Блоки, полный регресс и одна release-сборка

**Files:** обновлять `docs/emulator-regression.md` и итоговый `docs/a1-lektion2-release-report.md`; реальные логи, JUnit, APK, backup и скриншоты — только вне Git.

**Interfaces:** существующие команды package.json; результат блока `{status,exitCode,apk.sha256,scenarios}`; итоговый PASS допустим только при exit0 полного runner и всех обязательных checks. Отчёт фиксирует commit и версии инструментов.

- [ ] После review кода выполнить блоки host-тестов отдельно, сохраняя полные логи и exit code:

```sh
npm test -- --runInBand --selectProjects sql
npm test -- --runInBand --runTestsByPath test/unit/lektion2Content.test.ts test/unit/lektion2QuestionFactory.test.ts test/unit/grammarSentenceAnswer.test.ts
npm test -- --runInBand --runTestsByPath test/ui/wordEditor.test.tsx test/ui/csvPreview.test.tsx test/ui/grammarTraining.test.tsx test/ui/grammarNavigation.test.tsx test/ui/questionScreen.test.tsx
npm run test:scripts
```

- [ ] Выполнить полный host-regression: `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, `npm run test:scripts`; все exit0. Прежние 75 suites/393 tests — только исторический baseline, не ожидаемое число нового набора.
- [ ] Собрать release `VOCABULARY_ABI=arm64-v8a npm run build:android` с проверенными путями к прежнему ключу/toolchain. Проверить embedded JS, package, сертификат, отсутствие INTERNET permission и 40 WAV. Зафиксировать SHA-256, сохранить APK отдельно от каталога следующей сборки. Изменение product code после этого требует нового APK и повторного финального прогона.
- [ ] Подготовить dedicated AVD по `docs/emulator-regression.md`; не использовать личные AVD. Собрать manifest `run-inputs.json` с проверенными абсолютными путями final APK/model-dir/legacy APK/schema6 APK/fixtures/observations. Сохранить рядом воспроизводимый `run-regression.sh`, который передаёт эти реальные значения поддержанным флагам runner (`--apk`, `--previous-apk`, `--grammar-previous-apk`, `--schema6-apk`, `--fixture`, `--grammar-fixture`, `--dictionary-fixture`, `--dictionary-large-fixture`, `--model-dir`, `--observations`, `--report-dir`, `--avd`). Manifest не содержит паролей/ключей.
- [ ] Запустить через wrapper отдельно `--block extended-vocabulary`, затем `--block grammar-lektion2`; после них все остальные BLOCK_IDS из matrix по отдельности. Каждый запуск имеет отдельный report-dir. Убедиться, что wrapper не назначает block параметр полному запуску. Отсутствующие окружение, модель или observations обозначаются not-verified, не PASS.
- [ ] В новых блоках проверить 320dp и увеличенный шрифт: полный немецкий ответ256, umlaut-клавиши, открытая клавиатура, видимое поле/submit, прокрутка длинного feedback, возврат из помощника и фона. Проверить офлайн/TTS absent и installed-offline; наблюдения о звуке и тексте помощника заполнить по фактическим данным.
- [ ] Выполнить полный runner без `--block` на том же APK. Включить clean install, обе прежние upgrade-проверки и дополнительную schema6→8, resume, profile-isolation, backup1/2/3, оба новых блока и все старые проверки. Перед/после обновления сравнить граф экспортов, XP и текущие вопросы; после продолжения ожидается ровно одна новая попытка и соответствующие10XP.
- [ ] Проверить итоговый report через существующий валидатор, привязку JUnit/скриншотов к хэшу, отсутствие crash/ANR и восстановление настроек AVD. При дефекте добавить воспроизводящий failing test, исправить, повторить затронутый блок и полный финальный прогон. Записать реальные числа PASS/FAIL/not-verified; коммит отчёта `docs: record A1 and Lektion 2 regression results` только после получения данных.

### R3. Обновить Pixel и импортировать оба набора

**Files:** итоговый `docs/a1-lektion2-release-report.md`; пользовательская резервная копия, APK и CSV в артефактах задачи и `Download/GermanVocabulary`, не в Git.

**Interfaces:** ADB `/Users/anton/Documents/Codex/2026-10-03/j/work/toolchains/android-sdk/platform-tools/adb`; serial `52211FDAS002R5`. Перед записью убедиться, что это подключённый Pixel и активен Anton. Не переключать профиль по UUID из старого скриншота.

- [ ] После PASS R2 экспортировать текущие данные через штатный интерфейс телефона и скопировать backup на хост. Проверить чтение файла и сохранить его хэш. Записать реальные текущие количества слов, XP, освоенных целей, активных сессий; историческое число49 не использовать как утверждение о текущем состоянии. Сравнить подпись нового APK с установленным.
- [ ] Установить **тот же проверенный** APK командой `adb -s 52211FDAS002R5 install -r <проверенный абсолютный путь из run-inputs.json>`. Путь подставляется из manifest, не вводится буквально. Открыть приложение, убедиться в сохранности Anton, слов/XP/истории/модели и текущих занятий. Не использовать uninstall, clear или wipe. При ошибке установки/миграции остановить запись, сохранить логи; не пытаться понизить версию поверх новой БД.
- [ ] Скопировать оба CSV в `/sdcard/Download/GermanVocabulary/A1/`, выполнить media scan каждого файла, дождаться появления в picker. В Anton импортировать numbers затем A1 через «Ещё → Перенос данных»; перед подтверждением сверить 21/300 строк и отсутствие ошибок. Сохранить фактические added/duplicates каждого импорта и полный экспорт после.
- [ ] Повторно предпросмотреть и импортировать те же файлы: added=0, темы полны, XP/награды/прогресс прежних слов неизменны. Общая прибавка слов равна сумме added, а не всегда321. Новый профиль не получает эти личные наборы автоматически.
- [ ] Пройти на Pixel число, слово A1 и все пять грамматических практик, включая правильный и неверный sentence, Sie-контекст, клавиатуру, справочник и resume после force-stop. Проверить работу без сети. В личном профиле записать честно полученный от smoke-теста XP; не обнулять его прямой правкой БД. Дополнительные destructive/fault сценарии остаются на dedicated AVD.
- [ ] Итоговый отчёт: установленная версия/package, commit и APK SHA-256, backup path, 21/300 входных карточек и реальные дубли/новые, версия схемы по проверяемому свидетельству, результаты блоков/full/device и оставшиеся ограничения. Коммит обновлённого отчёта без персонального backup; сообщить пользователю результат установки.

## Проверка плана

- Словарь/части речи/миграции: V1; импорт и темы: V2; backup: V3/G4; редактор/учебные режимы/аудио/помощник: V4; содержимое: V5/G1.
- Все 2.9–2.14, однозначность и sentence grading: G1/G2; 24 цели и сохранение старых18: G3; UI/справочник/помощник: G5.
- TDD и блоки: каждый программный шаг + R1; full regression/эмулятор: R2; сохранение данных, установка и импорт в Anton: R3.
- Самопроверка интерфейсов: WordPart общий; BackupV3 общий; каталог2 добавляется после backup3; SqlStore.schemaTransaction введён V1 и используется G3; legacy payload не переписывается; все новые виды sentence всегда typed.
- Документ готов к проверке пользователем. Реализация начнётся после одобрения плана; ранее выбранный multi process сохраняется.
