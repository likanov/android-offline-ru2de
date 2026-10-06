import type { GrammarKind, GrammarTarget, PronounId, SeinForm } from './grammarTypes';
export const pronouns: readonly {id:PronounId;token:string;labelRu:string;sein:SeinForm}[] = [
  {id:'ich',token:'ich',labelRu:'я',sein:'bin'},{id:'du',token:'du',labelRu:'ты',sein:'bist'},
  {id:'er',token:'er',labelRu:'он',sein:'ist'},{id:'sie_feminine',token:'sie',labelRu:'она',sein:'ist'},
  {id:'es',token:'es',labelRu:'оно',sein:'ist'},{id:'wir',token:'wir',labelRu:'мы',sein:'sind'},
  {id:'ihr',token:'ihr',labelRu:'вы (на «ты»)',sein:'seid'},{id:'sie_plural',token:'sie',labelRu:'они',sein:'sind'},
  {id:'sie_formal',token:'Sie',labelRu:'Вы (вежливое обращение)',sein:'sind'},
];
const kinds: readonly GrammarKind[] = ['pronoun-cloze','sein-cloze'];
export const grammarTargets: readonly GrammarTarget[] = kinds.flatMap(kind => pronouns.map(p => ({id:`${kind}:${p.id}` as const,kind,pronounId:p.id,labelRu:p.labelRu,catalogVersion:1 as const})));
export function validateGrammarCatalog(): void {
  if (grammarTargets.length !== 18 || new Set(grammarTargets.map(t=>t.id)).size !== 18) throw new Error('GRAMMAR_CATALOG_INVALID');
  if (new Set(pronouns.map(p=>p.sein)).size !== 5) throw new Error('GRAMMAR_CATALOG_INVALID');
  if (grammarTargets.some(t => !pronouns.some(p=>p.id===t.pronounId))) throw new Error('GRAMMAR_CATALOG_INVALID');
}
validateGrammarCatalog();
