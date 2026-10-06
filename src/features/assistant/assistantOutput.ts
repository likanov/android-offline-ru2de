import type { AssistantContext } from './assistantTypes';

function article(context: AssistantContext) {
  if (context.word.pos !== 'noun' || !context.word.gender) return context.word.de;
  return `${{ m: 'der', f: 'die', n: 'das' }[context.word.gender]} ${context.word.de}`;
}
function genderLabel(context: AssistantContext) {
  if (context.word.gender === 'm') return 'синий мужской род';
  if (context.word.gender === 'f') return 'розовый женский род';
  if (context.word.gender === 'n') return 'зелёный средний род';
  return 'маркер карточки';
}
function firstSentence(text: string) { return text.split(/(?<=[.!?])\s+/u)[0]?.trim() || text.trim(); }
function fallbackText(context: AssistantContext): string {
  const target = article(context), word = context.word;
  if (context.request.mode === 'association')
    return `Ассоциация: ${target} — ${word.ru}. Представьте ${word.ru} с маркером «${genderLabel(context)}» и учите артикль вместе со словом.`;
  if (context.request.mode === 'example')
    return `DE: ${word.exampleDe || `${target} ist wichtig.`}\nRU: ${word.exampleRu || `${word.ru} важно.`}`;
  if (context.request.mode === 'rule') {
    const source = context.reference?.title ?? 'встроенный справочник';
    const rule = context.reference ? firstSentence(context.reference.text) : 'Род и артикль нужно учить вместе со словом.';
    return `${rule}\nПример: ${target} — ${word.ru}.\nИсточник: ${source}.`;
  }
  const words = (context.selectedWords.length ? context.selectedWords : [word]).slice(0, 10);
  const de = words.map(item => item.pos === 'noun' && item.gender ? `${{ m: 'der', f: 'die', n: 'das' }[item.gender]} ${item.de}` : item.de).join(', ');
  const ru = words.map(item => item.ru).join(', ');
  return `DE: Ich sehe ${de}. Die Wörter gehören zu meinem Zimmer.\nRU: Я вижу ${ru}. Эти слова относятся к моей комнате.`;
}
function parseJsonEcho(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}
export function userFacingAssistantText(text: string, context: AssistantContext): string {
  const trimmed = text.trim();
  const parsed = parseJsonEcho(trimmed) as { word?: { de?: unknown; ru?: unknown }, mode?: unknown, type?: unknown, selectedWords?: unknown, reference?: unknown } | null;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return fallbackText(context);
  if (/^```?json\b/i.test(trimmed) || /"word"\s*:\s*\{/.test(trimmed)) return fallbackText(context);
  return trimmed;
}
