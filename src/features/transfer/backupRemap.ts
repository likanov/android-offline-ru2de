import { decodeAidContent } from '../assistant/aidRepository';
import { randomUUID } from 'expo-crypto';
import type { BackupV1, ProfileBackup } from './backupTypes';
import { validateBackup } from './backupValidation';
export function remapBackup(backup: BackupV1, existingNames: string[]): ProfileBackup[] {
    const source = validateBackup(backup), names = new Set(existingNames), ids = new Map<string, string>();
    for (const p of source.profiles)
        for (const id of [p.profile.id, ...p.words.map(w => w.id), ...p.topics.map(t => t.id), ...p.aids.map(a => a.id), ...p.sessions.map(s => s.id), ...p.questions.map(q => q.attemptId)])
            ids.set(id, randomUUID());
    const references = new Set(['id', 'profileId', 'wordId', 'topicId', 'aidId', 'sessionId', 'attemptId']);
    function rewrite(value: unknown, key = ''): unknown {
        if (typeof value === 'string' && references.has(key))
            return ids.get(value)!;
        if (Array.isArray(value))
            return value.map(v => key === 'wordIds' ? ids.get(v) : rewrite(v));
        if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, k)]));
        return value;
    }
    const profiles = source.profiles.map(p => rewrite(p) as ProfileBackup);
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
