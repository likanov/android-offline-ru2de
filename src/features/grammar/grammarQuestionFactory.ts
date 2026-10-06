import type { Word } from '../learning/learningTypes';
import { grammarTargets, pronouns } from './grammarCatalog';
import type { GrammarQuestion, GrammarQuestionInput, GrammarOption, GrammarSubmission, GrammarTargetId, PronounId, SeinForm } from './grammarTypes';

const canonical: Record<string,{gender:'m'|'f'|'n';plural:string}> = {Tisch:{gender:'m',plural:'Tische'},Lampe:{gender:'f',plural:'Lampen'},Buch:{gender:'n',plural:'Bücher'},Haus:{gender:'n',plural:'Häuser'},Computer:{gender:'m',plural:'Computer'}};
const depWord = (words:Word[], de:string) => { const w=words.find(x=>x.de===de && x.profileId===words[0]?.profileId && x.gender===canonical[de]?.gender && x.plural===canonical[de]?.plural); return w && {wordId:w.id,revision:w.revision??1,de:w.de,ru:w.ru,gender:w.gender!,plural:w.plural}; };
const hash = (s:string) => Array.from(s).reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),7);
const pronounIds: PronounId[] = pronouns.map(p=>p.id); const seinForms: SeinForm[] = ['bin','bist','ist','sind','seid'];
const labels: Record<string,string> = Object.fromEntries(pronouns.map(p=>[p.id,`${p.token} — ${p.labelRu}`]));
function invalid():never { throw new Error('GRAMMAR_QUESTION_INVALID'); }
function info(targetId:GrammarTargetId) { const t=grammarTargets.find(x=>x.id===targetId); const p=pronouns.find(x=>x.id===t?.pronounId); if (!t||!p) invalid(); return {t:t!,p:p!}; }
function parts(targetId:GrammarTargetId, variant:number) {
  const {t,p}=info(targetId); const v=((variant%3)+3)%3;
  const noun = [['Tisch','стол','m','Tische'],['Lampe','лампа','f','Lampen'],['Buch','книга','n','Bücher']][v];
  if(t.kind==='pronoun-cloze') {
    if(v===0) return {position:'initial' as const, contextRu:`О себе: ${p.labelRu}.`,beforeDe:'',afterDe:` ${p.sein} groß.`,translation:`${p.token} ${p.sein} groß.`,ru:`${p.labelRu} высокий.`};
    if(v===1) return {position:'internal' as const, contextRu:`Замените существительное ${noun[1]} местоимением «${p.labelRu}».`,beforeDe:`Das ${noun[0]} ist neu. `,afterDe:' ist neu.',translation:`Das ${noun[0]} ist neu. ${p.token} ist neu.`,ru:`${noun[1]} — ${p.labelRu}.`};
    return {position:'initial' as const,contextRu:`Группа: ${p.labelRu}.`,beforeDe:'',afterDe:` ${p.sein} heute hier.`,translation:`${p.token} ${p.sein} heute hier.`,ru:`Сегодня ${p.labelRu} здесь.`};
  }
  const context = p.id==='sie_feminine'?'О ней: она высокая.':p.id==='sie_plural'?'О группе людей: они новые ученики.':p.id==='sie_formal'?'Вежливое обращение: Вы высокий.':`Согласование: ${p.labelRu}.`;
  if(v===0) return {position:'internal' as const,contextRu:context,beforeDe:`${p.token} `,afterDe:' groß.',translation:`${p.token} ${p.sein} groß.`,ru:context};
  if(v===1) return {position:'initial' as const,contextRu:context,beforeDe:'',afterDe:` ${p.sein} neu.`,translation:`${p.token} ${p.sein} neu.`,ru:context};
  return {position:'internal' as const,contextRu:context,beforeDe:`Heute ${p.token} `,afterDe:' hier.',translation:`Heute ${p.token} ${p.sein} hier.`,ru:context};
}
export function grammarResponseMode(attemptCount:number):'choice'|'typed' { return attemptCount===3?'typed':attemptCount>3 && attemptCount%2===1?'typed':'choice'; }
export function makeGrammarQuestion(input:GrammarQuestionInput):GrammarQuestion {
  const {t,p}=info(input.targetId); const b=parts(input.targetId,input.variantIndex); const ids=t.kind==='pronoun-cloze' ? [p.id,...pronounIds.filter(x=>x!==p.id && !(p.id.startsWith('sie_') ? false : x.startsWith('sie_'))).slice(0,3)] : [p.sein,...seinForms.filter(x=>x!==p.sein)].slice(0,4);
  const options:GrammarOption[] = ids.map(id=>({id,label:t.kind==='pronoun-cloze'?labels[id]:id})); const off=hash(input.attemptId)%options.length; const shuffled=[...options.slice(off),...options.slice(0,off)];
  const word = ['Tisch','Lampe','Buch'][input.variantIndex%3]; const d=depWord(input.words,word); const answerToken=t.kind==='pronoun-cloze'&&b.position==='initial'?p.token[0].toUpperCase()+p.token.slice(1):t.kind==='pronoun-cloze'?p.token:p.sein; const sentence=`${b.beforeDe}${answerToken}${b.afterDe}`;
  return {attemptId:input.attemptId,sessionId:input.sessionId,profileId:input.profileId,targetId:input.targetId,catalogVersion:1,templateId:`${input.targetId}:${input.variantIndex%3}`,kind:t.kind,responseMode:input.responseMode,position:b.position,contextRu:b.contextRu,beforeDe:b.beforeDe,afterDe:b.afterDe,options:shuffled,expected:{optionId:t.kind==='pronoun-cloze'?p.id:p.sein,token:t.kind==='pronoun-cloze'&&b.position==='initial'?p.token[0].toUpperCase()+p.token.slice(1):t.kind==='pronoun-cloze'?p.token:p.sein},feedback:{sentenceDe:sentence,translationRu:b.translation,ruleId:t.kind==='pronoun-cloze'?'pronouns-nominative':'sein-present',explanationRu:t.kind==='pronoun-cloze'?'В именительном падеже местоимение заменяет подлежащее.':'Форма sein согласуется с лицом и числом подлежащего.'},dependencies:d?[d]:[],reviewStage:input.reviewStage,dueDay:input.dueDay};
}
export function validateGrammarQuestion(q:GrammarQuestion):void { const input={attemptId:q.attemptId,sessionId:q.sessionId,profileId:q.profileId,targetId:q.targetId,responseMode:q.responseMode,reviewStage:q.reviewStage,dueDay:q.dueDay,variantIndex:Number(q.templateId.split(':').pop()),words:q.dependencies as unknown as Word[]}; let expected:GrammarQuestion; try{expected=makeGrammarQuestion(input)}catch{invalid()} if(q.catalogVersion!==1||q.templateId!==expected.templateId||q.kind!==expected.kind||q.expected.optionId!==expected.expected.optionId||q.expected.token!==expected.expected.token||q.contextRu!==expected.contextRu||q.beforeDe!==expected.beforeDe||q.afterDe!==expected.afterDe||q.options.length!==expected.options.length||new Set(q.options.map(x=>x.id)).size!==q.options.length||q.options.some(x=>!expected.options.some(y=>y.id===x.id))) invalid(); }
const validOption=(id:string) => pronounIds.includes(id as PronounId)||seinForms.includes(id as SeinForm);
export function checkGrammarAnswer(q:GrammarQuestion, answer:GrammarSubmission):boolean { validateGrammarQuestion(q); if(!answer || (answer.kind!=='typed'&&answer.kind!=='choice')) throw new Error('GRAMMAR_ANSWER_INVALID'); if(answer.kind==='choice'){if(!validOption(answer.optionId)||!q.options.some(x=>x.id===answer.optionId))throw new Error('GRAMMAR_ANSWER_INVALID'); return answer.optionId===q.expected.optionId;} if(typeof answer.text!=='string'||answer.text.length===0||answer.text.length>64||answer.text.trim().split(/\s+/).length!==1)throw new Error('GRAMMAR_ANSWER_INVALID'); const text=answer.text.normalize('NFC').trim(); return text===q.expected.token; }
export const grammarReference = {'pronouns-nominative':{title:'Личные местоимения',text:'В именительном падеже местоимение является подлежащим.'},'sein-present':{title:'Глагол sein',text:'Форма sein зависит от лица и числа подлежащего.'}} as const;
