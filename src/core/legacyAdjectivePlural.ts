/**
 * v6 allowed adjective plural through its editor. Keep its exact value in a
 * JSON string (including whitespace), without altering the existing note.
 * Clearing plural makes this conversion idempotent.
 */
export function archiveLegacyAdjectivePlural<T extends {pos:string;gender:string|null;plural?:string|null;note?:string}>(word:T):T {
  if (word.pos !== 'adjective' || word.gender !== null || word.plural == null) return word;
  return {...word, plural:null, note:(word.note ?? '')+'\n[Legacy adjective plural: '+JSON.stringify(word.plural)+']'};
}
