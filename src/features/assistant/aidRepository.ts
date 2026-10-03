import type { SqlStore } from '../../core/sql';
import type { HelperDraft } from './assistantTypes';
export type AidContent = Pick<HelperDraft, 'wordId' | 'mode' | 'ruleTopic' | 'text' | 'referenceTitle'> & {
    format: 'assistant-aid-v1';
};
export function decodeAidContent(content: string): AidContent | null {
    try {
        const value = JSON.parse(content);
        if (value?.format !== 'assistant-aid-v1' || typeof value.wordId !== 'string' || !['association', 'example', 'text', 'rule'].includes(value.mode) || typeof value.text !== 'string' || !value.text.trim() || !(value.ruleTopic === null || ['gender', 'articles'].includes(value.ruleTopic)) || !(value.referenceTitle === null || typeof value.referenceTitle === 'string'))
            return null;
        return value as AidContent;
    }
    catch {
        return null;
    }
}
export class AidRepository {
    constructor(private db: SqlStore) { }
    async current(profileId: string, wordId: string): Promise<HelperDraft[]> {
        return this.db.transaction(async (tx) => {
            const result: HelperDraft[] = [];
            const rows = await tx.all<{
                id: string;
                content: string;
            }>(`SELECT a.id,a.content FROM aids a WHERE a.profileId=? AND a.stale=0 AND EXISTS(SELECT 1 FROM aid_words aw WHERE aw.aidId=a.id AND aw.profileId=a.profileId AND aw.wordId=?) AND NOT EXISTS(SELECT 1 FROM aid_words aw LEFT JOIN words w ON w.profileId=aw.profileId AND w.id=aw.wordId WHERE aw.aidId=a.id AND (w.id IS NULL OR w.revision<>aw.revision)) ORDER BY a.rowid`, [profileId, wordId]);
            for (const row of rows) {
                const content = decodeAidContent(row.content);
                if (!content || content.wordId !== wordId)
                    continue;
                const dependencies = await tx.all<{
                    wordId: string;
                    revision: number;
                }>('SELECT wordId,revision FROM aid_words WHERE aidId=? AND profileId=? ORDER BY rowid', [row.id, profileId]);
                result.push({ requestId: row.id, profileId, wordId, mode: content.mode, ruleTopic: content.ruleTopic, text: content.text, referenceTitle: content.referenceTitle, dependencies });
            }
            return result;
        });
    }
}
