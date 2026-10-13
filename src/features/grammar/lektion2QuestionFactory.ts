import { lektion2Templates } from './lektion2Content';
import { pronouns } from './grammarCatalog';
import type { GrammarQuestionInput, GrammarOption, GrammarOptionId, Lektion2ClozeQuestion, GrammarSentenceQuestion, Lektion2Kind } from './grammarTypes';

export function makeLektion2Question(input: GrammarQuestionInput): Lektion2ClozeQuestion | GrammarSentenceQuestion {
 const templates=lektion2Templates.filter(t=>t.targetId===input.targetId);
 if(!templates.length || !Number.isInteger(input.variantIndex) || input.responseMode==='multi-choice' || !['choice','typed'].includes(input.responseMode)) throw new Error('GRAMMAR_QUESTION_INVALID');
 const t=templates[((input.variantIndex%templates.length)+templates.length)%templates.length];
 const kind:Lektion2Kind = t.targetId.startsWith('professions-pronoun:') ? 'professions-pronoun' : t.targetId.startsWith('professions-sein:') ? 'professions-sein' : t.targetId.startsWith('demonstrative-statement:') ? 'demonstrative-statement' : t.targetId.startsWith('yesno-transform:') ? 'yesno-transform' : 'yesno-translation';
 const common={attemptId:input.attemptId,sessionId:input.sessionId,profileId:input.profileId,targetId:t.targetId,catalogVersion:2 as const,templateId:t.id,kind,contextRu:t.contextRu,feedback:{sentenceDe:t.sentenceDe,translationRu:t.translationRu,ruleId:t.ruleId,explanationRu:t.explanationRu},dependencies:[],reviewStage:input.reviewStage,dueDay:input.dueDay};
 if(kind==='yesno-transform'||kind==='yesno-translation'||kind==='demonstrative-statement') return {...common,presentation:'sentence',responseMode:'typed',promptRu:kind==='yesno-transform'?'Преобразуйте утверждение в вопрос.':t.promptRu,sourceSentenceDe:kind==='yesno-transform'?t.promptRu:null,expected:{sentences:[...t.answers]}};
 const token=t.answers[0];
 const person=t.targetId.split(':')[1];
 const optionId:GrammarOptionId=kind==='professions-pronoun' ? pronouns.find(p=>p.id===person)!.id : pronouns.find(p=>p.id===person)!.sein;
 const candidates:GrammarOption[]=kind==='professions-pronoun'?pronouns.map(p=>({id:p.id,label:t.beforeDe?p.token:p.token[0].toUpperCase()+p.token.slice(1)})):(['bin','bist','ist','sind','seid'] as const).map(id=>({id,label:id}));
 const seen=new Set([token]);
 const options:GrammarOption[]=[{id:optionId,label:token}];
 for(const candidate of candidates) if(candidate.id!==optionId&&!seen.has(candidate.label)){seen.add(candidate.label);options.push(candidate);if(options.length===4)break;}
 const offset=Array.from(input.attemptId).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7)%options.length;
 return {...common,presentation:'cloze',responseMode:input.responseMode,position:t.beforeDe?'internal':'initial',beforeDe:t.beforeDe,afterDe:t.afterDe,options:[...options.slice(offset),...options.slice(0,offset)],expected:{optionId,token}};
}
export function validateLektion2Question(question:Lektion2ClozeQuestion|GrammarSentenceQuestion):void {
 const templates=lektion2Templates.filter(t=>t.targetId===question.targetId);
 const variantIndex=templates.findIndex(t=>t.id===question.templateId);
 if(variantIndex<0) throw new Error('GRAMMAR_QUESTION_INVALID');
 const trusted=makeLektion2Question({...question,variantIndex,words:[]});
 // Persisted choice order is part of the learner's snapshot. UUID remapping
 // changes the factory shuffle seed, so compare trusted options independent of order.
 const canonical=(q:Lektion2ClozeQuestion|GrammarSentenceQuestion)=>{
  if(q.presentation==='cloze'){
   if(!Array.isArray(q.options)) throw new Error('GRAMMAR_QUESTION_INVALID');
   return {...q,options:[...q.options].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
  }
  return q;
 };
 if(JSON.stringify(Object.entries(canonical(question)).sort(([a],[b])=>a.localeCompare(b)))!==JSON.stringify(Object.entries(canonical(trusted)).sort(([a],[b])=>a.localeCompare(b)))) throw new Error('GRAMMAR_QUESTION_INVALID');
}
