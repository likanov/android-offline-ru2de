import { lektion3ArticleItems, lektion3InvariantGroups, lektion3Nouns, lektion3PluralItems, lektion3Targets } from './lektion3Content';
import { lektion3Reference } from './lektion3Reference';
import type { GrammarQuestionInput, Lektion3Question } from './grammarTypes';
import type { Lektion3NounId } from './lektion3Types';
const noun = (id: Lektion3NounId) => lektion3Nouns.find(n => n.id === id)!;
const article = (gender: 'm' | 'f' | 'n') => gender === 'm' ? 'der' : gender === 'f' ? 'die' : 'das';
function invalid(): never { throw new Error('GRAMMAR_QUESTION_INVALID'); }
function shuffle<T>(items: readonly T[], attemptId: string): T[] {
    let seed = Array.from(attemptId).reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
export function makeLektion3Question(input: GrammarQuestionInput): Lektion3Question {
    const target = lektion3Targets.find(t => t.id === input.targetId);
    if (!target || !Number.isInteger(input.variantIndex) || !['choice', 'typed', 'multi-choice'].includes(input.responseMode) || (target?.kind === 'noun-article' && input.responseMode === 'multi-choice'))
        invalid();
    const count = target.kind === 'noun-article' ? 2 : target.kind === 'noun-plural' ? 1 : 12;
    const variant = ((input.variantIndex % count) + count) % count;
    const common = { attemptId: input.attemptId, sessionId: input.sessionId, profileId: input.profileId, targetId: target.id, catalogVersion: 3 as const, dependencies: [], reviewStage: input.reviewStage, dueDay: input.dueDay };
    if (target.kind === 'plural-invariant') {
        const group = lektion3InvariantGroups[variant];
        const items = group.nounIds.map(id => { const n = noun(id); return { nounId: id, singularDe: `${article(n.gender)} ${n.de}`, pluralDe: `die ${n.plural}`, translationRu: n.ru, unchanged: n.unchanged }; });
        return { ...common, templateId: group.id, kind: target.kind, presentation: 'multi-choice', responseMode: 'multi-choice', contextRu: 'Выберите все существительные, форма которых не меняется во множественном числе.', options: shuffle(items.map(item => ({id:item.nounId,label:item.singularDe})), input.attemptId), expected: { optionIds: [...group.expectedIds] }, feedback: { sentenceDe: items.map(i => `${i.singularDe} → ${i.pluralDe}`).join('; '), translationRu: items.map(i => i.translationRu).join('; '), ruleId: 'plural-invariant', explanationRu: lektion3Reference['plural-invariant'].text, items } };
    }
    const id = target.id.split(':')[1] as Lektion3NounId;
    const n = noun(id);
    if (target.kind === 'noun-article') {
        const item = lektion3ArticleItems.filter(i => i.nounId === id)[variant];
        const plural = item.number === 'plural';
        const expected = plural ? 'die' : article(n.gender);
        const form = plural ? n.plural : n.de;
        return { ...common, templateId: item.id, kind: target.kind, presentation: 'cloze', number: item.number, responseMode: input.responseMode === 'typed' ? 'typed' : 'choice', contextRu: plural ? 'Множественное число: выберите определённый артикль.' : 'Единственное число: выберите определённый артикль.', beforeDe: '', afterDe: ` ${form}`, options: shuffle((['der', 'die', 'das'] as const).map(id => ({ id, label: id })), input.attemptId), expected: { optionId: expected, token: expected }, feedback: { sentenceDe: `${expected} ${form}`, translationRu: n.ru, ruleId: 'definite-article-nominative', explanationRu: lektion3Reference['definite-article-nominative'].text } };
    }
    const item = lektion3PluralItems.find(i => i.nounId === id)!;
    return { ...common, templateId: item.id, kind: 'noun-plural', presentation: 'phrase', responseMode: 'typed', contextRu: `${id === 'wort' ? 'Контекст: отдельное слово языка. ' : ''}Введите полную форму множественного числа с артиклем die.`, sourcePhraseDe: `${article(n.gender)} ${n.de}`, expected: { phrases: [`die ${n.plural}`] }, feedback: { sentenceDe: `die ${n.plural}`, translationRu: n.ru, ruleId: 'noun-plural', explanationRu: lektion3Reference['noun-plural'].text } };
}
function canonical(q: Lektion3Question): unknown {
    if ('options' in q) {
        if (!Array.isArray(q.options))
            invalid();
        return { ...q, options: [...q.options].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
    }
    return q;
}
export function validateLektion3Question(question: Lektion3Question): void {
    const target = lektion3Targets.find(t => t.id === question.targetId);
    if (!target)
        invalid();
    const templates = target.kind === 'noun-article' ? lektion3ArticleItems.filter(i => `noun-article:${i.nounId}` === target.id) : target.kind === 'noun-plural' ? lektion3PluralItems.filter(i => `noun-plural:${i.nounId}` === target.id) : lektion3InvariantGroups;
    const variantIndex = templates.findIndex(t => t.id === question.templateId);
    if (variantIndex < 0)
        invalid();
    const trusted = makeLektion3Question({ ...question, responseMode: question.responseMode === 'multi-choice' ? 'choice' : question.responseMode, variantIndex, words: [] });
    const serialized = (q: Lektion3Question) => JSON.stringify(Object.entries(canonical(q) as object).sort(([a], [b]) => a.localeCompare(b)));
    if (serialized(question) !== serialized(trusted))
        invalid();
}
