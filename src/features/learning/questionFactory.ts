import type { Word } from './learningTypes';
import type { Question, QuizKind } from './questionTypes';
import { normalizeAnswer } from './normalizeAnswer';
export function germanLabel(w: Word): string { return w.pos === 'noun' ? `${{ m: 'der', f: 'die', n: 'das' }[w.gender!]} ${w.de}` : w.de; }
const unique = (values: string[]) => values.filter((v, i) => values.findIndex(x => normalizeAnswer(x) === normalizeAnswer(v)) === i);
export function buildQuestion(word: Word, vocabulary: Word[], kind: QuizKind, attemptId: string): Question | null {
    const article = kind === 'definite-article' || kind === 'indefinite-article';
    if (article && word.pos !== 'noun')
        return null;
    const vocab = vocabulary.filter(w => w.profileId === word.profileId);
    const aliases = vocab.filter(w => normalizeAnswer(w.ru) === normalizeAnswer(word.ru) && w.pos === word.pos && w.gender === word.gender);
    let expected = [germanLabel(word)], options: string[] = [], prompt = word.ru;
    if (kind === 'de-ru') {
        prompt = germanLabel(word);
        expected = [word.ru];
        options = unique([word.ru, ...vocab.filter(w => normalizeAnswer(w.de) !== normalizeAnswer(word.de)).map(w => w.ru)]).slice(0, 4);
    }
    else if (article) {
        prompt = word.de;
        expected = [kind === 'definite-article' ? { m: 'der', f: 'die', n: 'das' }[word.gender!] : word.gender === 'f' ? 'eine' : 'ein'];
        options = kind === 'definite-article' ? ['der', 'die', 'das'] : ['ein', 'eine'];
    }
    else if (kind === 'listening') {
        prompt = 'Прослушайте слово';
    }
    else if (kind === 'typing') {
        expected = unique([germanLabel(word), ...aliases.map(germanLabel)]);
    }
    else {
        options = unique([germanLabel(word), ...vocab.filter(w => w.pos === word.pos && normalizeAnswer(w.ru) !== normalizeAnswer(word.ru)).map(germanLabel)]).slice(0, 4);
    }
    if ((kind === 'ru-de' || kind === 'de-ru') && options.length < 2)
        return buildQuestion(word, vocab, 'typing', attemptId);
    // Spread the correct option across positions without changing a persisted question.
    if (options.length > 1) {
        const offset = Array.from(attemptId).reduce((n, c) => n + c.charCodeAt(0), 0) % options.length;
        options = [...options.slice(offset), ...options.slice(0, offset)];
    }
    return { attemptId, profileId: word.profileId, wordId: word.id, revision: word.revision ?? 1, kind, prompt, options, expected, markerVisible: word.pos === 'noun' && !article && kind !== 'listening', reviewStage: null, dueDay: null };
}
