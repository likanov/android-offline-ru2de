import { decodeAidContent } from '../assistant/aidRepository';
import { randomUUID } from 'expo-crypto';
import type { BackupV2, GrammarProfileBackup, ProfileBackupV2 } from './backupTypes';
import { validateBackup } from './backupValidation';
const references = new Set(['id', 'profileId', 'wordId', 'topicId', 'aidId', 'sessionId', 'attemptId']);
const grammarOptionIds = new Set(['ich', 'du', 'er', 'sie_feminine', 'es', 'wir', 'ihr', 'sie_plural', 'sie_formal', 'bin', 'bist', 'ist', 'sind', 'seid']);
function rewrite(value: unknown, ids: ReadonlyMap<string, string>, key = ''): unknown {
    if (typeof value === 'string' && references.has(key)) {
        const mapped = ids.get(value);
        if (!mapped) {
            // Grammar option IDs also use the JSON key `id`, but are stable
            // catalog values (for example `er` and `sind`), not UUID links.
            if (key === 'id' && grammarOptionIds.has(value)) return value;
            throw new Error('Резервная копия содержит неизвестную ссылку');
        }
        return mapped;
    }
    if (Array.isArray(value)) return value.map(item => key === 'wordIds' ? (ids.get(String(item)) ?? item) : rewrite(item, ids));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, rewrite(child, ids, childKey)]));
    return value;
}
export function remapGrammarBackup(grammar: GrammarProfileBackup, ids: ReadonlyMap<string, string>): GrammarProfileBackup {
    return rewrite(grammar, ids) as GrammarProfileBackup;
}
export function remapBackup(backup: BackupV2, existingNames: string[]): ProfileBackupV2[] {
    const source = validateBackup(backup), names = new Set(existingNames), ids = new Map<string, string>();
    for (const p of source.profiles)
        for (const id of [p.profile.id, ...p.words.map(w => w.id), ...p.topics.map(t => t.id), ...p.aids.map(a => a.id), ...p.sessions.map(s => s.id), ...p.questions.map(q => q.attemptId), ...p.attempts.map(a => a.attemptId), ...p.grammar.sessions.map(s => s.id), ...p.grammar.questions.map(q => q.question.attemptId), ...p.grammar.attempts.map(a => a.result.attemptId)])
            if (!ids.has(id)) ids.set(id, randomUUID());
    const profiles = source.profiles.map(p => rewrite(p, ids) as ProfileBackupV2);
    for (const p of profiles) {
        for(const aid of p.aids){const content=decodeAidContent(aid.content);if(content)aid.content=JSON.stringify({...content,wordId:ids.get(content.wordId)});}
        const original = p.profile.name;
        let name = original, n = 2;
        while (names.has(name))
            name = `${original} восстановлено ${n++}`;
        names.add(name);
        p.profile.name = name;
    }
    return profiles;
}
