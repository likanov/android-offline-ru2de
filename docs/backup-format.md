# Full backup JSON, version 3

The system save dialog writes a UTF-8 JSON document. Import reads at most 50 MiB before decoding or parsing; the JavaScript preview also counts UTF-8 bytes before `JSON.parse`. A leading UTF-8 BOM is accepted. The format is local and requires no network access.

The root object has `format: "german-vocabulary-backup"`, `version: 3`, `createdAt` (UTC ISO timestamp with milliseconds), and `profiles`.

Each profile contains:

| Field | Contents |
| --- | --- |
| `profile` | UUID, name, total XP, creation timestamp |
| `words` | UUIDs, owner UUID, seed identity, German/Russian text, grammar, plural, examples, note, icon, lexical revision, canonical key |
| `progress` | Word UUID references, mastery/streak, earned-bonus flag, review stage and calendar due date, difficulty/recovery counters |
| `skillStats`, `skillHistory` | Current revision totals and complete attempt-linked skill history |
| `topics`, `wordTopics` | Topics and their word memberships |
| `settings` | Owner UUID and daily goal |
| `dailyActivity` | Calendar dates, correct/error counts, XP |
| `aids`, `aidWords` | Saved assistant content, stale flag, all related words and revisions, including second-word links |
| `sessions` | UUID, owner, mode, word UUID queue, cursors, status, current question, saved result |
| `questions` | Shared attempt UUID, owner/session/word references, revision, structured question payload and answered/cancelled/active status |
| `attempts` | Shared attempt UUID, owner/session/word references, correctness, XP delta, structured result, answer date |
| `rewards` | Owner/word/attempt references, amount 50, calendar award date |

`wordIds`, `currentQuestion`, `payload`, and `result` are structured JSON values, rather than nested JSON strings. Database integer flags remain 0/1; question and answer-result flags are JSON booleans. Composite-key records have no invented ID; each of their references is a UUID. A question and its answer/history/reward intentionally share an attempt UUID.

Reward date is the date of the linked answer. The SQLite reward table has no independent date column, so exporting derives `rewards[].day` from that immutable attempt. Restore retains the answer day; later exports preserve the reward day.

The backup excludes app settings, active profile selection, model files/path/manifest, and reminder settings or native notification schedules. Restored profile reminder fields receive the disabled database defaults. Unknown properties are discarded by an allowlist; unsupported format/version and invalid required fields are rejected.

Validation checks safe nonnegative integers, enumerations, UUID uniqueness, ownership and all references, canonical/seed uniqueness, calendar dates, mastery/streak/review/difficulty invariants, current skill and daily totals, saved answer results and rewards. Total profile XP must equal the sum of attempt XP deltas: incorrect 0, ordinary correct 10, first mastery 60 with exactly one linked 50-point reward. Bonus flags must agree with stored rewards. Historical question/skill revisions may precede the current word revision. An unanswered active question must refer to the current lexical revision and contain a valid current prompt, expected answers and review state.

Export collects every profile table under one database read transaction. JSON serialization and the system save dialog happen after that snapshot is released. Restore revalidates a detached preview, remaps every entity UUID and every reference (including structured questions/results and aid links), then inserts every restored profile in one transaction. Validation failure or any SQL/storage failure rolls back the whole restore. File contents are parameter values only and never supply executable SQL.

Restoration creates new profiles and preserves existing data. Colliding names gain ` восстановлено 2`, then increasing numbers; collisions among imported profiles are also resolved. Answered results remain answered, so resubmitting a restored attempt returns its saved result and never grants XP or a mastery reward twice. An active lesson can be resumed after selecting its new profile.

Cancellation of either system dialog is quiet. Save errors show a storage message; a failed native write makes a best-effort removal of the newly created incomplete document. A provider may still leave an empty/partial document if it also refuses deletion; such a document cannot pass restore validation.

Version 3 exports all nine word parts: noun, adjective, number, verb, pronoun, adverb, preposition, conjunction, phrase. German text retains case (including Sie) and the NFC normalization applied when words are saved. Each profile includes `grammar` with `catalogVersions: (1|2)[]`, progress, sessions, questions, attempts and rewards. The supported versions come from the active application catalog; currently only `[1]` is registered. Catalog 2 is not accepted until its application integration is enabled.

Imports still accept versions 1 and 2. Their original word schema remains restricted to noun/adjective; version 2 grammar remains restricted to catalog 1 and its legacy target IDs/questions. Validate the source version strictly before migrating it to the internal version 3 representation. Version 1 gains an empty grammar container; version 2 replaces its singular `catalogVersion: 1` with `catalogVersions: [1]`. Grammar and word attempts jointly determine profile XP and daily activity; grammar rewards retain the same replay and uniqueness checks. Older application versions cannot read version 3 files.
