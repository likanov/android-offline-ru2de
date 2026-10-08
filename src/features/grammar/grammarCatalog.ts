import { lektion2Templates } from './lektion2Content';
import type { GrammarKind, LegacyGrammarTarget, GrammarTarget, GrammarTargetId, Lektion2Target, PronounId, SeinForm } from './grammarTypes';
export const pronouns: readonly {id:PronounId;token:string;labelRu:string;sein:SeinForm}[] = [
  {id:'ich',token:'ich',labelRu:'я',sein:'bin'},{id:'du',token:'du',labelRu:'ты',sein:'bist'},
  {id:'er',token:'er',labelRu:'он',sein:'ist'},{id:'sie_feminine',token:'sie',labelRu:'она',sein:'ist'},
  {id:'es',token:'es',labelRu:'оно',sein:'ist'},{id:'wir',token:'wir',labelRu:'мы',sein:'sind'},
  {id:'ihr',token:'ihr',labelRu:'вы (на «ты»)',sein:'seid'},{id:'sie_plural',token:'sie',labelRu:'они',sein:'sind'},
  {id:'sie_formal',token:'Sie',labelRu:'Вы (вежливое обращение)',sein:'sind'},
];
const kinds: readonly GrammarKind[] = ['pronoun-cloze','sein-cloze'];
export const grammarTargets: readonly LegacyGrammarTarget[] = kinds.flatMap(kind => pronouns.map(p => ({id:`${kind}:${p.id}` as const,kind,pronounId:p.id,labelRu:p.labelRu,catalogVersion:1 as const})));
export function validateGrammarCatalog(): void {
  if (grammarTargets.length !== 18 || new Set(grammarTargets.map(t=>t.id)).size !== 18) throw new Error('GRAMMAR_CATALOG_INVALID');
  if (new Set(pronouns.map(p=>p.sein)).size !== 5) throw new Error('GRAMMAR_CATALOG_INVALID');
  if (grammarTargets.some(t => !pronouns.some(p=>p.id===t.pronounId))) throw new Error('GRAMMAR_CATALOG_INVALID');
}
validateGrammarCatalog();

export const lektion2Targets: readonly Lektion2Target[] = [
  {"id": "professions-pronoun:ich", "kind": "professions-pronoun", "pronounId": "ich", "labelRu": "Я рассказываю о себе.", "catalogVersion": 2},
  {"id": "professions-pronoun:du", "kind": "professions-pronoun", "pronounId": "du", "labelRu": "Обращение к одному знакомому на «ты».", "catalogVersion": 2},
  {"id": "professions-pronoun:er", "kind": "professions-pronoun", "pronounId": "er", "labelRu": "Речь об одном мужчине.", "catalogVersion": 2},
  {"id": "professions-pronoun:wir", "kind": "professions-pronoun", "pronounId": "wir", "labelRu": "Говорящий рассказывает о себе и своей группе.", "catalogVersion": 2},
  {"id": "professions-pronoun:ihr", "kind": "professions-pronoun", "pronounId": "ihr", "labelRu": "Обращение к нескольким знакомым на «ты».", "catalogVersion": 2},
  {"id": "professions-pronoun:sie_plural", "kind": "professions-pronoun", "pronounId": "sie_plural", "labelRu": "Речь о группе: они.", "catalogVersion": 2},
  {"id": "professions-pronoun:sie_formal", "kind": "professions-pronoun", "pronounId": "sie_formal", "labelRu": "Вежливое обращение.", "catalogVersion": 2},
  {"id": "professions-sein:ich", "kind": "professions-sein", "pronounId": "ich", "labelRu": "Я рассказываю о себе.", "catalogVersion": 2},
  {"id": "professions-sein:du", "kind": "professions-sein", "pronounId": "du", "labelRu": "Обращение к одному знакомому на «ты».", "catalogVersion": 2},
  {"id": "professions-sein:er", "kind": "professions-sein", "pronounId": "er", "labelRu": "Речь об одном мужчине.", "catalogVersion": 2},
  {"id": "professions-sein:wir", "kind": "professions-sein", "pronounId": "wir", "labelRu": "Говорящий рассказывает о себе и своей группе.", "catalogVersion": 2},
  {"id": "professions-sein:ihr", "kind": "professions-sein", "pronounId": "ihr", "labelRu": "Обращение к нескольким знакомым на «ты».", "catalogVersion": 2},
  {"id": "professions-sein:sie_plural", "kind": "professions-sein", "pronounId": "sie_plural", "labelRu": "Речь о группе: они.", "catalogVersion": 2},
  {"id": "professions-sein:sie_formal", "kind": "professions-sein", "pronounId": "sie_formal", "labelRu": "Вежливое обращение.", "catalogVersion": 2},
  {"id": "demonstrative-statement:singular", "kind": "demonstrative-statement", "pronounId": null, "labelRu": "Единственное число", "catalogVersion": 2},
  {"id": "demonstrative-statement:plural", "kind": "demonstrative-statement", "pronounId": null, "labelRu": "Множественное число", "catalogVersion": 2},
  {"id": "yesno-transform:pronoun", "kind": "yesno-transform", "pronounId": null, "labelRu": "Вопрос с местоимением", "catalogVersion": 2},
  {"id": "yesno-transform:noun", "kind": "yesno-transform", "pronounId": null, "labelRu": "Вопрос с существительным", "catalogVersion": 2},
  {"id": "yesno-translation:du", "kind": "yesno-translation", "pronounId": "du", "labelRu": "Обращение к одному знакомому на «ты».", "catalogVersion": 2},
  {"id": "yesno-translation:er", "kind": "yesno-translation", "pronounId": "er", "labelRu": "Речь об одном мужчине.", "catalogVersion": 2},
  {"id": "yesno-translation:ihr", "kind": "yesno-translation", "pronounId": "ihr", "labelRu": "Обращение к нескольким знакомым на «ты».", "catalogVersion": 2},
  {"id": "yesno-translation:sie_plural", "kind": "yesno-translation", "pronounId": "sie_plural", "labelRu": "Речь о группе: они.", "catalogVersion": 2},
  {"id": "yesno-translation:sie_formal", "kind": "yesno-translation", "pronounId": "sie_formal", "labelRu": "Вежливое обращение.", "catalogVersion": 2},
  {"id": "yesno-translation:noun", "kind": "yesno-translation", "pronounId": null, "labelRu": "Вопрос с существительным", "catalogVersion": 2},
 ];
export const allGrammarTargets: readonly GrammarTarget[] = [...grammarTargets, ...lektion2Targets];
export function getGrammarTarget(id:GrammarTargetId):GrammarTarget {
  const target = allGrammarTargets.find(t=>t.id===id);
  if (!target) throw new Error('GRAMMAR_TARGET_INVALID');
  return target;
}
export function getGrammarVariantCount(id:GrammarTargetId):number {
  const target=getGrammarTarget(id);
  return target.catalogVersion===1 ? 3 : lektion2Templates.filter(t=>t.targetId===id).length;
}
export function getGrammarCatalogVersions():(1|2)[] { return [1,2]; }
