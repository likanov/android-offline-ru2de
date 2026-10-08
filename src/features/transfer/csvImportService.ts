import { profileSelectionVersion } from '../profiles/profileRepository';
import type { SqlStore,SqlExecutor } from '../../core/sql';
import { AppError } from '../../core/errors';
import { notifyProfileChanged } from '../../app/refreshBus';
import { WordRepository } from '../dictionary/wordRepository';
import { wordKey } from '../dictionary/wordValidation';
import { findOrCreateTopic } from '../topics/topicRepository';
import { parseCsv,csvRowToWord,type CsvRow } from './csvParser';
export type CsvPreview={profileId:string;valid:CsvRow[];existing:CsvRow[];duplicates:number[];errors:{line:number;message:string}[];sourceText:string};
export class CsvImportService {
 private issued=new WeakMap<CsvPreview,{profileId:string;text:string;selection:number}>();
 constructor(private db:SqlStore){}
 private async requireProfile(tx:SqlExecutor,profileId:string){
  const active=await tx.first<{activeProfileId:string|null}>('SELECT activeProfileId FROM app_settings WHERE id=1');
  if(active?.activeProfileId!==profileId)throw new AppError('WRONG_PROFILE','Профиль изменился. Выберите файл заново.');
 }
 private async buildPreview(tx:SqlExecutor,profileId:string,text:string):Promise<CsvPreview>{
  await this.requireProfile(tx,profileId);
  const parsed=parseCsv(text),keys=new Set((await tx.all<{canonicalKey:string}>('SELECT canonicalKey FROM words WHERE profileId=?',[profileId])).map(word=>word.canonicalKey));
  const preview:CsvPreview={profileId,valid:[],existing:[],duplicates:[],errors:[],sourceText:text};
  for(const record of parsed.rows){
   let row:CsvRow;
   try{row=csvRowToWord(record);}catch(error){preview.errors.push({line:record.line,message:error instanceof Error?error.message:String(error)});continue;}
   const key=wordKey(row.draft);
   if(keys.has(key)){preview.duplicates.push(row.line);preview.existing.push(row);}else{keys.add(key);preview.valid.push(row);}
  }
  return preview;
 }
 async preview(profileId:string,text:string):Promise<CsvPreview>{
  return this.db.transaction(async tx=>{
   const preview=await this.buildPreview(tx,profileId,text);
   this.issued.set(preview,{profileId,text,selection:profileSelectionVersion(this.db)});
   return preview;
  });
 }
 async commit(preview:CsvPreview):Promise<{added:number;duplicates:number;invalid:number}>{
  const result=await this.db.transaction(async tx=>{
   const original=this.issued.get(preview);
   if(!original)throw new AppError('VALIDATION','Сначала создайте предпросмотр CSV');
   if(original.selection!==profileSelectionVersion(this.db))throw new AppError('WRONG_PROFILE','Профиль изменился. Выберите файл заново.');
   const current=await this.buildPreview(tx,original.profileId,original.text),words=new WordRepository(this.db);
   for(const row of [...current.valid,...current.existing]){
    let word=await tx.first<{id:string}>('SELECT id FROM words WHERE profileId=? AND canonicalKey=?',[current.profileId,wordKey(row.draft)]);
    if(!word)word=await words.saveWordWithTopicsInTransaction(tx,current.profileId,row.draft,[]);
    if(row.topicName){
     const topic=await findOrCreateTopic(tx,current.profileId,row.topicName);
     await tx.run('INSERT OR IGNORE INTO word_topics(profileId,wordId,topicId) VALUES (?,?,?)',[current.profileId,word.id,topic.id]);
    }
   }
   return {added:current.valid.length,duplicates:current.duplicates.length,invalid:current.errors.length};
  });
  notifyProfileChanged(this.issued.get(preview)!.profileId);return result;
 }
}
