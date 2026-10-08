import { grammarTargets, pronouns } from './grammarCatalog';
import type { GrammarOption, GrammarOptionId, LegacyGrammarQuestion, SeinForm } from './grammarTypes';

type ChoiceQuestion = Pick<LegacyGrammarQuestion, 'attemptId' | 'targetId' | 'position'>;
const seinForms: readonly SeinForm[] = ['bin', 'bist', 'ist', 'sind', 'seid'];

function candidates(targetId: LegacyGrammarQuestion['targetId']) {
  const target = grammarTargets.find(item => item.id === targetId);
  const pronoun = pronouns.find(item => item.id === target?.pronounId);
  if (!target || !pronoun) throw new Error('GRAMMAR_QUESTION_INVALID');

  const alternatives = pronoun.id.startsWith('sie_')
    ? [...pronouns.filter(item => item.id.startsWith('sie_') && item.id !== pronoun.id), ...pronouns.filter(item => !item.id.startsWith('sie_'))]
    : pronouns.filter(item => item.id !== pronoun.id && !item.id.startsWith('sie_'));
  const ids: GrammarOptionId[] = target.kind === 'pronoun-cloze'
    ? [pronoun.id, ...alternatives.map(item => item.id)]
    : [pronoun.sein, ...seinForms.filter(form => form !== pronoun.sein)];
  return { target, ids };
}

function shuffle(options: GrammarOption[], attemptId: string): GrammarOption[] {
  const hash = Array.from(attemptId).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  const offset = hash % options.length;
  return [...options.slice(offset), ...options.slice(0, offset)];
}

export function grammarChoiceOptions(question: ChoiceQuestion): GrammarOption[] {
  const { target, ids } = candidates(question.targetId);
  const options: GrammarOption[] = [];
  const labels = new Set<string>();
  // Keep the contextual target's ID when several meanings share one spelling.
  for (const id of ids) {
    const pronoun = pronouns.find(item => item.id === id);
    let label: string = pronoun?.token ?? id;
    if (target.kind === 'pronoun-cloze' && question.position === 'initial') {
      label = label[0].toUpperCase() + label.slice(1);
    }
    if (labels.has(label)) continue;
    labels.add(label);
    options.push({ id, label });
    if (options.length === 4) break;
  }
  return shuffle(options, question.attemptId);
}

// Exact shipped v1 labels are retained solely to validate saved snapshots.
export function legacyGrammarChoiceOptions(question: Pick<ChoiceQuestion, 'attemptId' | 'targetId'>): GrammarOption[] {
  const { target, ids } = candidates(question.targetId);
  const options = ids.slice(0, 4).map(id => {
    const pronoun = pronouns.find(item => item.id === id);
    return { id, label: target.kind === 'pronoun-cloze' && pronoun ? `${pronoun.token} — ${pronoun.labelRu}` : id };
  });
  return shuffle(options, question.attemptId);
}
