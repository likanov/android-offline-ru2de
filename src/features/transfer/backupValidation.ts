import { AppError } from '../../core/errors';
import { addDays } from '../../core/calendar';
import { applyAnswer } from '../learning/learningRules';
import { buildQuestion, germanLabel } from '../learning/questionFactory';
import { wordKey } from '../dictionary/wordValidation';
import type { BackupV1, BackupV2, ProfileBackup, ProfileBackupV2 } from './backupTypes';
import { validateCombinedLedger, validateGrammarProfile } from './grammarBackupValidation';
import type { LearningState } from '../learning/learningTypes';
type Parser = (value: unknown) => unknown;
type Shape = Record<string, Parser>;
function invalid(): never { throw new AppError('VALIDATION', 'Резервная копия повреждена или имеет неподдерживаемый формат'); }
const string: Parser = v => typeof v === 'string' ? v : invalid();
const nonempty: Parser = v => typeof v === 'string' && v.trim() ? v : invalid();
const uuid: Parser = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : invalid();
const integer = (min = 0, max = Number.MAX_SAFE_INTEGER): Parser => v => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : invalid();
const flag = integer(0, 1);
const boolean: Parser = v => typeof v === 'boolean' ? v : invalid();
const oneOf = (...values: unknown[]): Parser => v => values.includes(v) ? v : invalid();
const nullable = (parser: Parser): Parser => v => v === null ? null : parser(v);
const optional = (parser: Parser): Parser => v => v === undefined ? undefined : parser(v);
const array = (parser: Parser): Parser => v => Array.isArray(v) ? v.map(parser) : invalid();
const object = (shape: Shape): Parser => v => { if (!v || typeof v !== 'object' || Array.isArray(v))
    return invalid(); const source = v as Record<string, unknown>; return Object.fromEntries(Object.entries(shape).map(([key, parser]) => [key, parser(source[key])])); };
const day: Parser = v => { string(v); addDays(v as string, 0); return v; };
const iso: Parser = v => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
    return invalid(); day(v.slice(0, 10)); if (!Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== v)
    return invalid(); return v; };
const state: Parser = v => { const result = object({ streak: integer(0, 20), mastered: boolean, masteryBonusGranted: boolean, reviewStage: integer(0, 5), dueDay: nullable(day), difficult: boolean, totalErrors: integer(), recoveryErrors: integer(), recoveryCorrect: integer(0, 2) })(v) as LearningState; applyAnswer(result, false, result.mastered ? 'review' : 'study', result.dueDay ?? '2026-01-01'); return result; };
const result = object({ attemptId: uuid, right: boolean, xpDelta: oneOf(0, 10, 60), state, submittedAnswer: optional(string) });
const question = object({ attemptId: uuid, profileId: uuid, wordId: uuid, revision: integer(1), kind: oneOf('ru-de', 'de-ru', 'typing', 'definite-article', 'indefinite-article', 'listening'), prompt: nonempty, options: array(nonempty), expected: array(nonempty), markerVisible: boolean, reviewStage: nullable(integer(0, 5)), dueDay: nullable(day), nextKindIndex: v => v === undefined ? undefined : integer()(v) });
const owner = { profileId: uuid }, wordOwner = { ...owner, wordId: uuid }, skill = oneOf('translation', 'writing', 'article', 'listening');
const profile = object({ id: uuid, name: nonempty, xp: integer(), createdAt: iso });
const word = object({ id: uuid, ...owner, seedKey: nullable(string), seedDe: nullable(string), de: nonempty, ru: nonempty, pos: oneOf('noun', 'adjective'), gender: nullable(oneOf('m', 'f', 'n')), plural: nullable(string), exampleDe: nullable(string), exampleRu: nullable(string), note: string, icon: nullable(string), revision: integer(1), canonicalKey: string });
const progress = object({ ...wordOwner, streak: integer(0, 20), learned: flag, bonusAwarded: flag, reviewStage: integer(0, 5), dueDate: nullable(day), difficult: flag, totalErrors: integer(), recoveryErrors: integer(), recoveryCorrect: integer(0, 2) });
const session = object({ id: uuid, ...owner, mode: oneOf('study', 'review'), wordIds: array(uuid), cursor: integer(), kindIndex: integer(), currentQuestion: nullable(question), result: nullable(result), status: oneOf('active', 'completed', 'cancelled') });
const part = object({ profile, words: array(word), progress: array(progress), skillStats: array(object({ ...wordOwner, skill, correct: integer(), errors: integer(), revision: integer(1) })), skillHistory: array(object({ attemptId: uuid, ...wordOwner, revision: integer(1), skill, right: flag, day })), topics: array(object({ id: uuid, ...owner, name: nonempty })), wordTopics: array(object({ ...wordOwner, topicId: uuid })), settings: object({ ...owner, dailyGoal: integer(1, 200) }), dailyActivity: array(object({ ...owner, day, correct: integer(), errors: integer(), xp: integer() })), aids: array(object({ id: uuid, ...owner, content: string, stale: flag })), aidWords: array(object({ aidId: uuid, ...wordOwner, revision: integer(1) })), sessions: array(session), questions: array(object({ attemptId: uuid, ...wordOwner, sessionId: uuid, revision: integer(1), payload: question, status: oneOf('active', 'answered', 'cancelled') })), attempts: array(object({ attemptId: uuid, ...wordOwner, sessionId: uuid, right: flag, xpDelta: oneOf(0, 10, 60), result, day })), rewards: array(object({ ...wordOwner, attemptId: uuid, amount: oneOf(50), day })) });
function same(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function unique(values: string[]) { if (new Set(values).size !== values.length)
    invalid(); }
function checkProfile(p: ProfileBackup) {
    const id = p.profile.id, words = new Map(p.words.map(w => [w.id, w])), topics = new Set(p.topics.map(t => t.id)), aids = new Set(p.aids.map(a => a.id)), sessions = new Map(p.sessions.map(s => [s.id, s])), questions = new Map(p.questions.map(q => [q.attemptId, q])), attempts = new Map(p.attempts.map(a => [a.attemptId, a]));
    for (const rows of [p.words, p.progress, p.skillStats, p.skillHistory, p.topics, p.wordTopics, [p.settings], p.dailyActivity, p.aids, p.aidWords, p.sessions, p.questions, p.attempts, p.rewards])
        for (const row of rows) {
            if (row.profileId !== id)
                invalid();
            if ('wordId' in row && !words.has(row.wordId))
                invalid();
        }
    unique(p.words.map(w => w.canonicalKey));
    unique(p.words.filter(w => w.seedKey !== null).map(w => w.seedKey!));
    for (const w of p.words)
        if ((w.pos === 'noun') !== (w.gender !== null) || w.canonicalKey !== wordKey(w))
            invalid();
    unique(p.progress.map(r => r.wordId));
    if (p.progress.length !== p.words.length)
        invalid();
    for (const r of p.progress)
        state({ streak: r.streak, mastered: !!r.learned, masteryBonusGranted: !!r.bonusAwarded, reviewStage: r.reviewStage, dueDay: r.dueDate, difficult: !!r.difficult, totalErrors: r.totalErrors, recoveryErrors: r.recoveryErrors, recoveryCorrect: r.recoveryCorrect });
    unique(p.skillStats.map(r => `${r.wordId}/${r.skill}`));
    for (const r of p.skillStats)
        if (r.revision !== words.get(r.wordId)!.revision)
            invalid();
    unique(p.wordTopics.map(r => `${r.wordId}/${r.topicId}`));
    for (const r of p.wordTopics)
        if (!topics.has(r.topicId))
            invalid();
    unique(p.aidWords.map(r => `${r.wordId}/${r.aidId}`));
    for (const r of p.aidWords)
        if (!aids.has(r.aidId) || r.revision > words.get(r.wordId)!.revision)
            invalid();
    unique(p.attempts.map(a => a.attemptId));
    unique(p.skillHistory.map(a => a.attemptId));
    unique(p.dailyActivity.map(r => r.day));
    unique(p.rewards.map(r => r.wordId));
    unique(p.rewards.map(r => r.attemptId));
    if (p.sessions.filter(s => s.status === 'active').length > 1)
        invalid();
    for (const q of p.questions) {
        const payload = q.payload;
        if (!sessions.has(q.sessionId) || payload.attemptId !== q.attemptId || payload.profileId !== id || payload.wordId !== q.wordId || payload.revision !== q.revision || !payload.expected.length || q.revision > words.get(q.wordId)!.revision)
            invalid();
        if (q.status === 'answered' !== attempts.has(q.attemptId))
            invalid();
        if (q.status === 'active') {
            const s = sessions.get(q.sessionId)!, w = words.get(q.wordId)!, r = p.progress.find(r => r.wordId === w.id)!;
            if (s.status !== 'active' || s.result || !same(s.currentQuestion, payload) || q.revision !== w.revision) {
                // The persisted rotation cursor belongs only to the row payload.
                const { nextKindIndex: _rotation, ...plain } = payload;
                if (s.status !== 'active' || s.result || !same(s.currentQuestion, plain) || q.revision !== w.revision)
                    invalid();
            }
            if (!s.wordIds.includes(w.id) || (s.mode === 'study' && (r.learned || payload.reviewStage !== null || payload.dueDay !== null)) || (s.mode === 'review' && (!r.learned || payload.reviewStage !== r.reviewStage || payload.dueDay !== r.dueDate)))
                invalid();
            const built = buildQuestion(w, p.words, payload.kind, q.attemptId);
            if (!built || built.kind !== payload.kind || built.prompt !== payload.prompt || built.markerVisible !== payload.markerVisible || !same([...built.expected].sort(), [...payload.expected].sort()))
                invalid();
            const allowed = payload.kind === 'de-ru' ? p.words.map(w => w.ru) : payload.kind === 'definite-article' ? ['der', 'die', 'das'] : payload.kind === 'indefinite-article' ? ['ein', 'eine'] : p.words.map(germanLabel);
            unique(payload.options);
            if (payload.options.some(o => !allowed.includes(o)) || ((payload.kind === 'typing' || payload.kind === 'listening') ? payload.options.length !== 0 : payload.options.length < 2 || !payload.options.some(o => payload.expected.includes(o))))
                invalid();
        }
    }
    for (const s of p.sessions) {
        unique(s.wordIds);
        if (s.wordIds.some(w => !words.has(w)))
            invalid();
        if (s.currentQuestion) {
            const q = questions.get(s.currentQuestion.attemptId);
            if (!q || q.sessionId !== s.id)
                invalid();
            const { nextKindIndex: _rotation, ...plain } = q.payload;
            if (!same(s.currentQuestion, plain))
                invalid();
            if (s.result) {
                const a = attempts.get(s.result.attemptId);
                if (!a || a.sessionId !== s.id || a.attemptId !== q.attemptId || !same(s.result, a.result))
                    invalid();
            }
            else if (s.status === 'active' && q.status !== 'active')
                invalid();
        }
        else if (s.result)
            invalid();
    }
    let xp = 0;
    for (const a of p.attempts) {
        const q = questions.get(a.attemptId);
        if (!q || q.status !== 'answered' || q.sessionId !== a.sessionId || q.wordId !== a.wordId || a.result.attemptId !== a.attemptId || a.result.right !== !!a.right || a.result.xpDelta !== a.xpDelta || a.xpDelta !== (a.right ? (p.rewards.some(r => r.attemptId === a.attemptId) ? 60 : 10) : 0))
            invalid();
        xp += a.xpDelta;
        if (!Number.isSafeInteger(xp))
            invalid();
    }
    if (xp !== p.profile.xp)
        invalid();
    for (const r of p.rewards) {
        const a = attempts.get(r.attemptId);
        if (!a || a.wordId !== r.wordId || a.xpDelta !== 60 || r.day !== a.day || !a.result.state.mastered || !a.result.state.masteryBonusGranted)
            invalid();
    }
    for (const r of p.progress)
        if (!!r.bonusAwarded !== p.rewards.some(reward => reward.wordId === r.wordId))
            invalid();
    if (p.skillHistory.length !== p.attempts.length)
        invalid();
    for (const r of p.skillHistory) {
        const a = attempts.get(r.attemptId), q = questions.get(r.attemptId);
        const expectedSkill = q?.payload.kind === 'typing' ? 'writing' : q?.payload.kind === 'listening' ? 'listening' : q?.payload.kind.includes('article') ? 'article' : 'translation';
        if (!a || !q || r.wordId !== a.wordId || r.revision !== q.revision || r.right !== a.right || r.day !== a.day || r.skill !== expectedSkill)
            invalid();
    }
    const totals = new Map<string, {
        correct: number;
        errors: number;
    }>();
    for (const h of p.skillHistory) {
        if (h.revision !== words.get(h.wordId)!.revision)
            continue;
        const key = `${h.wordId}/${h.skill}`, total = totals.get(key) ?? { correct: 0, errors: 0 };
        if (h.right)
            total.correct++;
        else
            total.errors++;
        totals.set(key, total);
    }
    if (totals.size !== p.skillStats.length)
        invalid();
    for (const r of p.skillStats) {
        const total = totals.get(`${r.wordId}/${r.skill}`);
        if (!total || r.correct !== total.correct || r.errors !== total.errors)
            invalid();
    }
    const days = new Set(p.attempts.map(a => a.day));
    if (days.size !== p.dailyActivity.length)
        invalid();
    for (const r of p.dailyActivity) {
        const rows = p.attempts.filter(a => a.day === r.day);
        if (r.correct !== rows.filter(a => a.right).length || r.errors !== rows.filter(a => !a.right).length || r.xp !== rows.reduce((n, a) => n + a.xpDelta, 0))
            invalid();
    }
}
export function validateBackupV1(value: unknown): BackupV1 {
    const backup = object({ format: oneOf('german-vocabulary-backup'), version: oneOf(1), createdAt: iso, profiles: array(part) })(value) as BackupV1;
    unique(backup.profiles.flatMap(p => [p.profile.id, ...p.words.map(w => w.id), ...p.topics.map(t => t.id), ...p.aids.map(a => a.id), ...p.sessions.map(s => s.id), ...p.questions.map(q => q.attemptId)]));
    for (const p of backup.profiles)
        checkProfile(p);
    return backup;
}

function emptyGrammar(): ProfileBackupV2['grammar'] {
    return { catalogVersion: 1, progress: [], sessions: [], questions: [], attempts: [], rewards: [] };
}

function wordOnlyPart(part: ProfileBackupV2): ProfileBackup {
    const wordXp = part.attempts.reduce((sum, attempt) => sum + attempt.xpDelta, 0);
    const wordDays = new Set(part.attempts.map(attempt => attempt.day));
    return {
        ...part,
        profile: { ...part.profile, xp: wordXp },
        dailyActivity: part.dailyActivity
            .filter(row => wordDays.has(row.day))
            .map(row => {
                const rows = part.attempts.filter(attempt => attempt.day === row.day);
                return { ...row, correct: rows.filter(attempt => !!attempt.right).length, errors: rows.filter(attempt => !attempt.right).length, xp: rows.reduce((sum, attempt) => sum + attempt.xpDelta, 0) };
            }),
    } as ProfileBackup;
}

export function validateBackup(value: unknown): BackupV2 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const source = value as Record<string, unknown>;
    if (source.format !== 'german-vocabulary-backup' || typeof source.createdAt !== 'string') invalid();
    if (source.version === 1) {
        const v1 = validateBackupV1(value);
        return {
            format: v1.format,
            version: 2,
            createdAt: v1.createdAt,
            profiles: v1.profiles.map(profile => ({ ...profile, grammar: emptyGrammar() })),
        };
    }
    if (source.version !== 2 || !Array.isArray(source.profiles)) invalid();
    const backup = {
        format: source.format,
        version: 2 as const,
        createdAt: source.createdAt,
        profiles: source.profiles,
    } as BackupV2;
    // Keep the old strict validator for all vocabulary tables, but validate XP and
    // daily totals against the word ledger only here; grammar is checked below.
    for (const profile of backup.profiles) {
        if (!profile || typeof profile !== 'object' || !('grammar' in profile)) invalid();
        validateBackupV1({ format: 'german-vocabulary-backup', version: 1, createdAt: backup.createdAt, profiles: [wordOnlyPart(profile)] });
        validateGrammarProfile(profile);
        validateCombinedLedger(profile);
    }
    const ids = new Set<string>();
    const attemptIds = new Set<string>();
    for (const profile of backup.profiles) {
        const candidates = [profile.profile.id, ...profile.words.map(row => row.id), ...profile.topics.map(row => row.id), ...profile.aids.map(row => row.id), ...profile.sessions.map(row => row.id), ...profile.grammar.sessions.map(row => row.id)];
        for (const id of candidates) {
            if (ids.has(id)) invalid();
            ids.add(id);
        }
        for (const id of [...profile.attempts.map(row => row.attemptId), ...profile.grammar.attempts.map(row => row.result.attemptId)]) {
            if (attemptIds.has(id)) invalid();
            attemptIds.add(id);
        }
    }
    return JSON.parse(JSON.stringify(backup)) as BackupV2;
}
