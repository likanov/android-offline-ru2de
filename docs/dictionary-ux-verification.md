# Проверка удобства словаря

Документ связывает требования аудита с автоматическими проверками и Android-доказательствами. Host-проверки выполняются локально; визуальные, TalkBack и performance-наблюдения принимаются только из артефактов текущего APK.

| Условие | Реализация | Доказательство | Статус |
| --- | --- | --- | --- |
| Поиск, добавление и две строки доступны до прокрутки; найденный результат нажимаем при клавиатуре | Компактный `DictionaryScreen`, отдельный список и keyboard-aware layout | `dictionary.viewport-keyboard`, два screenshot/UI hierarchy, observations `twoRowsVisible`, `addVisible`, `resultTappable` | Реализовано; Android-подтверждение не запускалось |
| Запрос, фильтры и профильный контекст сохраняются | `useDictionaryViewState`, controlled dictionary route, profile-scoped snapshots | `dictionary.context-return`, observations `contextPreserved`, `profilesIsolated` | Реализовано; Android-подтверждение не запускалось |
| Артикли, plural и варианты написания | `dictionarySearch.ts` и строгий `normalizeAnswer` | Unit/SQLite tests и `dictionary.search-variants` | Host зелёный |
| Пустые состояния и выбранные фильтры понятны | Отдельные loading/error/empty состояния и `accessibilityState.selected` | `dictionary.empty-status-accessibility`, observations `emptyStatesReviewed`, `talkBackReviewed`, `selectedAnnounced` | Реализовано; TalkBack не запускался |
| Шрифт 1.5 и действия доступны | Убрано ограничение масштаба вкладок, компактные touch targets | `dictionary.large-font`, observations `labelsReadable`, `actionsReachable` | Реализовано; Android-подтверждение не запускалось |
| 10 000 слов без лишних чтений SQLite | Snapshot hook загружает SQLite один раз; большой профиль — отдельная v2 fixture | `dictionary.large-profile`, `wordCount=10000`, 20 измерений и `p95Ms` | Host fixture зелёный; Android performance не измерялась |

## Команды

Проверки сценариев и валидатора:

```text
./scripts/toolchain.sh npm run test:scripts
```

Полный host-набор:

```text
./scripts/toolchain.sh npm test -- --runInBand
./scripts/toolchain.sh npm run typecheck
./scripts/toolchain.sh npm run lint
```

Генерация fixtures для Android:

```text
DICTIONARY_FIXTURE_OUTPUT=/private/tmp/dictionary-ux.json \
DICTIONARY_LARGE_FIXTURE_OUTPUT=/private/tmp/dictionary-large.json \
./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/integration/dictionaryFixtures.test.ts
```

Android block и полный регресс требуют release APK, модель, выделенный AVD API 36, Maestro и observations-файл. Если устройство, модель или UI-наблюдения недоступны, `validateDictionaryUxEvidence` оставляет блок в состоянии `not-verified`; успешный JUnit сам по себе не подменяет screenshot, hierarchy, TalkBack и измерения.
