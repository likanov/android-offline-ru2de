import type { GrammarSubmission, Lektion3Question } from './grammarTypes';
import { validateLektion3Question } from './lektion3QuestionFactory';
function invalid(): never { throw new Error('GRAMMAR_ANSWER_INVALID'); }
export function normalizePluralPhrase(text: string): string { return text.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/^Die /, 'die '); }
export function checkLektion3Answer(question: Lektion3Question, answer: GrammarSubmission): boolean {
    validateLektion3Question(question);
    if (!answer || question.responseMode !== answer.kind)
        invalid();
    if (question.kind === 'plural-invariant') {
        if (answer.kind !== 'multi-choice' || !Array.isArray(answer.optionIds) || !answer.optionIds.length || new Set(answer.optionIds).size !== answer.optionIds.length || answer.optionIds.some(id => !question.options.some(o => o.id === id)))
            invalid();
        return answer.optionIds.length === question.expected.optionIds.length && question.expected.optionIds.every(id => answer.optionIds.includes(id));
    }
    if (answer.kind === 'choice') {
        if (question.kind !== 'noun-article' || !question.options.some(o => o.id === answer.optionId))
            invalid();
        return answer.optionId === question.expected.optionId;
    }
    if (answer.kind !== 'typed' || typeof answer.text !== 'string' || !answer.text.trim() || answer.text.length > 64)
        invalid();
    if (question.kind === 'noun-plural')
        return question.expected.phrases.includes(normalizePluralPhrase(answer.text));
    const token = answer.text.normalize('NFC').trim();
    return token === question.expected.token || token === question.expected.token[0].toUpperCase() + question.expected.token.slice(1);
}
