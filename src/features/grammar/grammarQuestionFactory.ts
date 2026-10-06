import type { Word } from '../learning/learningTypes';
import { grammarTargets, pronouns } from './grammarCatalog';
import type { GrammarQuestion, GrammarQuestionInput, GrammarOption, GrammarSubmission, GrammarTargetId, PronounId, SeinForm } from './grammarTypes';

const canonical: Record<string,{gender:'m'|'f'|'n';plural:string}> = {Tisch:{gender:'m',plural:'Tische'},Lampe:{gender:'f',plural:'Lampen'},Buch:{gender:'n',plural:'Bücher'},Haus:{gender:'n',plural:'Häuser'},Computer:{gender:'m',plural:'Computer'}};
const depWord = (words:Word[], profileId:string, de:string|undefined) => { if(!de) return undefined; const w=words.find(x=>x.de===de && x.profileId===profileId && x.gender===canonical[de]?.gender && x.plural===canonical[de]?.plural); return w && {wordId:w.id,profileId:w.profileId,revision:w.revision??1,de:w.de,ru:w.ru,gender:w.gender!,plural:w.plural}; };
const hash = (s:string) => Array.from(s).reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),7);
const pronounIds: PronounId[] = pronouns.map(p=>p.id); const seinForms: SeinForm[] = ['bin','bist','ist','sind','seid'];
const labels: Record<string,string> = Object.fromEntries(pronouns.map(p=>[p.id,`${p.token} — ${p.labelRu}`]));
function invalid():never { throw new Error('GRAMMAR_QUESTION_INVALID'); }
function info(targetId:GrammarTargetId) { const t=grammarTargets.find(x=>x.id===targetId); const p=pronouns.find(x=>x.id===t?.pronounId); if (!t||!p) invalid(); return {t:t!,p:p!}; }
function parts(targetId:GrammarTargetId, variant:number) {
  const {t,p}=info(targetId); const v=((variant%3)+3)%3;
  const object = p.id==='er'?'Tisch':p.id==='sie_feminine'?'Lampe':(p.id==='es'||p.id==='sie_plural'?'Buch':undefined);
  if(t.kind==='pronoun-cloze') {
    if(v===1 && object) {
      const noun=object==='Tisch'?['Der','Tisch','стол','ist']:object==='Lampe'?['Die','Lampe','лампа','ist']:['Das','Buch','книга',p.id==='sie_plural'?'sind':'ist'];
      const plural=p.id==='sie_plural';
      return {position:'initial' as const,contextRu:`Замените ${plural?'существительное во множественном числе':'существительное'} ${noun[2]} местоимением «${p.labelRu}».`,beforeDe:`${plural?'Die Bücher':`${noun[0]} ${noun[1]}`} ${noun[3]} neu. `,afterDe:` ${noun[3]} neu.`,translationRu:`${plural?'Книги':'Предмет'}: ${p.labelRu}.`,dependencyDe:object};
    }
    if(v===0) return {position:'initial' as const,contextRu:`Контекст: ${p.labelRu}.`,beforeDe:'',afterDe:` ${p.sein} hier.`,translationRu:`${p.labelRu} находится здесь.`};
    if(v===1) return {position:'initial' as const,contextRu:`Контекст: ${p.labelRu}.`,beforeDe:'Das ist klar: ',afterDe:` ${p.sein} hier.`,translationRu:`Ясно: ${p.labelRu} находится здесь.`};
    return {position:'internal' as const,contextRu:`Контекст: ${p.labelRu}.`,beforeDe:'Ich sehe, dass ',afterDe:` hier ${p.sein}.`,translationRu:`Я вижу, что ${p.labelRu} находится здесь.`};
  }
  const context=p.id==='sie_feminine'?'О ней: она высокая.':p.id==='sie_plural'?'О группе людей: они новые ученики.':p.id==='sie_formal'?'Вежливое обращение: Вы здесь.':`Согласование: ${p.labelRu}.`;
  if(v===0)return {position:'internal' as const,contextRu:context,beforeDe:`${p.token[0].toUpperCase()+p.token.slice(1)} `,afterDe:' groß.',translationRu:`${context} Это утверждение о высоте.`};
  const subject = p.id === 'sie_formal' ? 'Sie' : p.token;
  if(v===1)return {position:'internal' as const,contextRu:context,beforeDe:`Ich weiß, dass ${subject} hier `,afterDe:'.',translationRu:`${context} Я знаю, что это так.`};
  return {position:'internal' as const,contextRu:context,beforeDe:'Heute ',afterDe:` ${subject} hier.`,translationRu:`${context} Сегодня это так.`};
}
export function grammarResponseMode(attemptCount:number):'choice'|'typed' { return attemptCount===3?'typed':attemptCount>3 && attemptCount%2===1?'typed':'choice'; }
export function makeGrammarQuestion(input:GrammarQuestionInput):GrammarQuestion {
  const {t,p}=info(input.targetId); const b=parts(input.targetId,input.variantIndex); const ids=t.kind==='pronoun-cloze' ? [p.id,...(p.id.startsWith('sie_') ? [...pronounIds.filter(x=>x.startsWith('sie_') && x!==p.id),...pronounIds.filter(x=>!x.startsWith('sie_'))] : pronounIds.filter(x=>x!==p.id&&!x.startsWith('sie_')))].slice(0,4) : [p.sein,...seinForms.filter(x=>x!==p.sein)].slice(0,4);
  const options:GrammarOption[] = ids.map(id=>({id,label:t.kind==='pronoun-cloze'?labels[id]:id})); const off=hash(input.attemptId)%options.length; const shuffled=[...options.slice(off),...options.slice(0,off)];
  const d=depWord(input.words,input.profileId,b.dependencyDe); const answerToken=t.kind==='pronoun-cloze'&&b.position==='initial'?p.token[0].toUpperCase()+p.token.slice(1):t.kind==='pronoun-cloze'?p.token:p.sein; const sentence=`${b.beforeDe}${answerToken}${b.afterDe}`;
  return {attemptId:input.attemptId,sessionId:input.sessionId,profileId:input.profileId,targetId:input.targetId,catalogVersion:1,templateId:`${input.targetId}:${((input.variantIndex%3)+3)%3}`,kind:t.kind,responseMode:input.responseMode,position:b.position,contextRu:b.contextRu,beforeDe:b.beforeDe,afterDe:b.afterDe,options:shuffled,expected:{optionId:t.kind==='pronoun-cloze'?p.id:p.sein,token:t.kind==='pronoun-cloze'&&b.position==='initial'?p.token[0].toUpperCase()+p.token.slice(1):t.kind==='pronoun-cloze'?p.token:p.sein},feedback:{sentenceDe:sentence,translationRu:b.translationRu,ruleId:t.kind==='pronoun-cloze'?'pronouns-nominative':'sein-present',explanationRu:t.kind==='pronoun-cloze'?'В именительном падеже местоимение заменяет подлежащее.':'Форма sein согласуется с лицом и числом подлежащего.'},dependencies:d?[d]:[],reviewStage:input.reviewStage,dueDay:input.dueDay};
}
const sameGrammarOptions = (a:GrammarOption[], b:GrammarOption[]) => JSON.stringify([...a].sort((x,y)=>x.id.localeCompare(y.id))) === JSON.stringify([...b].sort((x,y)=>x.id.localeCompare(y.id)));
export function validateGrammarQuestion(q:GrammarQuestion, trustedWords?:Word[]):void { const raw=q.templateId.split(':').pop()??''; const variantIndex=Number(raw); if(!Number.isInteger(variantIndex)||variantIndex<0||variantIndex>2) invalid(); const words=trustedWords??q.dependencies.map(d=>({id:d.wordId,profileId:d.profileId??q.profileId,de:d.de,ru:d.ru,pos:'noun' as const,gender:d.gender,plural:d.plural,exampleDe:null,exampleRu:null,note:'',revision:d.revision})); let expected:GrammarQuestion; try{expected=makeGrammarQuestion({attemptId:q.attemptId,sessionId:q.sessionId,profileId:q.profileId,targetId:q.targetId,responseMode:q.responseMode,reviewStage:q.reviewStage,dueDay:q.dueDay,variantIndex,words})}catch{invalid()} const checks={catalog:q.catalogVersion===1,template:q.templateId===expected.templateId,kind:q.kind===expected.kind,mode:['choice','typed'].includes(q.responseMode),expected:JSON.stringify(q.expected)===JSON.stringify(expected.expected),position:q.position===expected.position,context:q.contextRu===expected.contextRu,before:q.beforeDe===expected.beforeDe,after:q.afterDe,qoptions:sameGrammarOptions(q.options,expected.options),feedback:JSON.stringify(q.feedback)===JSON.stringify(expected.feedback),deps:JSON.stringify(q.dependencies)===JSON.stringify(expected.dependencies)}; if(!Object.values(checks).every(Boolean)) invalid(); }
const validOption=(id:string) => pronounIds.includes(id as PronounId)||seinForms.includes(id as SeinForm);
export function checkGrammarAnswer(q:GrammarQuestion, answer:GrammarSubmission):boolean { validateGrammarQuestion(q); if(!answer || (answer.kind!=='typed'&&answer.kind!=='choice') || (q.responseMode==='typed'&&answer.kind!=='typed') || (q.responseMode==='choice'&&answer.kind!=='choice')) throw new Error('GRAMMAR_ANSWER_INVALID'); if(answer.kind==='choice'){if(!validOption(answer.optionId)||!q.options.some(x=>x.id===answer.optionId))throw new Error('GRAMMAR_ANSWER_INVALID'); return answer.optionId===q.expected.optionId;} if(typeof answer.text!=='string'||answer.text.trim().length===0||answer.text.length>64||answer.text.trim().split(/\s+/).length!==1)throw new Error('GRAMMAR_ANSWER_INVALID'); const text=answer.text.normalize('NFC').trim(); return text===q.expected.token; }
export const grammarReference = {'pronouns-nominative':{title:'Личные местоимения',text:'В именительном падеже местоимение является подлежащим.'},'sein-present':{title:'Глагол sein',text:'Форма sein зависит от лица и числа подлежащего.'}} as const;
