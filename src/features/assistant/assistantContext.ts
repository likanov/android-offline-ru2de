import { AppError } from '../../core/errors';
import type { Word } from '../learning/learningTypes';
import type { AssistantContext, HelperRequest } from './assistantTypes';
export function buildContext(request: HelperRequest, words: Word[], reference: AssistantContext['reference']): AssistantContext {
    if (!['association', 'example', 'text', 'rule'].includes(request.mode) || !Array.isArray(request.selectedWordIds) || request.selectedWordIds.length > 10)
        throw new AppError('VALIDATION', 'Выберите не больше 10 слов и доступную функцию');
    const owned = (id: string) => { const word = words.find(w => w.id === id); if (!word || word.profileId !== request.profileId)
        throw new AppError('WRONG_PROFILE', 'Слово не принадлежит профилю'); return word; };
    const word = owned(request.wordId), selected = request.selectedWordIds.map(owned);
    if (request.mode === 'rule' && (!['gender', 'articles'].includes(request.ruleTopic ?? '') || !reference?.title || !reference.text))
        throw new AppError('VALIDATION', 'Выберите тему справочника');
    const selectedWords = request.mode === 'text' ? [...new Map([word, ...selected].map(w => [w.id, w])).values()] : [];
    if (selectedWords.length > 10)
        throw new AppError('VALIDATION', 'Выберите не больше 10 слов, включая открытую карточку');
    const dependencies = (request.mode === 'text' ? selectedWords : [word]).map(w => ({ wordId: w.id, revision: w.revision ?? 1 }));
    return { request: { ...request, selectedWordIds: [...request.selectedWordIds] }, word, selectedWords, dependencies, reference: request.mode === 'rule' ? reference : null };
}
