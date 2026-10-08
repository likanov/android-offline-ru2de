import { createWordHarness } from '../harness';
import { CsvImportService } from '../../src/features/transfer/csvImportService';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import type { SqlStore } from '../../src/core/sql';
async function snapshotDb(db:SqlStore){const result:Record<string,unknown>={};for(const {name} of await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"))result[name]=await db.all(`SELECT * FROM "${name}" ORDER BY rowid`);return result;}
test('quoted_csv_unicode_and_profile_change',async()=>{
 const h=await createWordHarness();try{
 const p1=await createProfile(h.db,'A');const csv=new CsvImportService(h.db);
 const text='\uFEFFde,ru,pos,gender,note,topic\nStuhl,"стул, мягкий",noun,m,"строка 1\nстрока 2",Комната\nschön,красивый,adjective,,,\ngroß,большой,adjective,,,\ngross,большой,adjective,,,\ngroß,большой,adjective,,,\nTisch,стол,noun,,,\nleer,,adjective,,,\nx,y,interjection,,,';
 const preview=await csv.preview(p1.id,text);expect(preview.valid).toHaveLength(3);expect(preview.duplicates).toEqual([4,7]);expect(preview.errors.map(e=>e.line)).toEqual([8,9,10]);
 await createProfile(h.db,'B');const before=await snapshotDb(h.db);await expect(csv.commit(preview)).rejects.toMatchObject({code:'WRONG_PROFILE'});expect(await snapshotDb(h.db)).toEqual(before);
 await setActiveProfile(h.db,p1.id);const fresh=await csv.preview(p1.id,text);expect(await csv.commit(fresh)).toEqual({added:3,duplicates:2,invalid:3});expect(await csv.commit(fresh)).toEqual({added:0,duplicates:5,invalid:3});
 const word=(await h.words.list(p1.id,{query:'gross'}))[0];expect(await h.wordState(p1.id,word.id)).toMatchObject({streak:0,mastered:false,totalErrors:0});expect((await h.profile(p1.id))?.xp).toBe(0);
 const imported=(await h.words.list(p1.id,{query:'мягкий'}))[0];expect(await h.topics.wordTopics(p1.id,imported.id)).toEqual([expect.objectContaining({name:'Комната'})]);
 }finally{h.close();}
});
test('commit rechecks DB, reparses source and rolls back the whole import',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 const preview=await csv.preview(p.id,'de,ru,pos,topic\nfrisch,свежий,adjective,Новый\nweich,мягкий,adjective,Новый');
 await h.words.create(p.id,preview.valid[0].draft);preview.valid[1].draft.de='tampered';
 expect(await csv.commit(preview)).toEqual({added:1,duplicates:1,invalid:0});expect(await h.words.list(p.id,{query:'tampered'})).toEqual([]);
 const another=await csv.preview(p.id,'de,ru,pos,topic\nhart,твёрдый,adjective,Другой\nhell,светлый,adjective,Другой');
 await h.db.exec("CREATE TRIGGER fail_csv BEFORE INSERT ON word_topics BEGIN SELECT RAISE(ABORT,'disk failure'); END;");const before=await snapshotDb(h.db);
 await expect(csv.commit(another)).rejects.toThrow('disk failure');expect(await snapshotDb(h.db)).toEqual(before);
 await expect(csv.preview(p.id,'de,ru,pos\nx,"bad,adjective')).rejects.toMatchObject({code:'VALIDATION'});
 await expect(csv.preview(p.id,'a'.repeat(10*1024*1024+1))).rejects.toMatchObject({code:'VALIDATION'});
 }finally{h.close();}
});
test('preview_profile_roundtrip_is_stale',async()=>{
 const h=await createWordHarness();try{
 const p1=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);const preview=await csv.preview(p1.id,'de,ru,pos\nweich,мягкий,adjective');
 await createProfile(h.db,'B');await setActiveProfile(h.db,p1.id);const before=await snapshotDb(h.db);
 await expect(csv.commit(preview)).rejects.toMatchObject({code:'WRONG_PROFILE'});expect(await snapshotDb(h.db)).toEqual(before);
 expect(await csv.commit(await csv.preview(p1.id,preview.sourceText))).toMatchObject({added:1});
 }finally{h.close();}
});
test('documented CSV previews and quoted-empty records report physical line errors',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 const fixture='de,ru,pos,gender,plural,example_de,example_ru,note,topic\nStuhl,стул,noun,m,die Stühle,Der Stuhl ist klein.,Стул маленький.,Синий стул,Комната\nklein,маленький,adjective,,,,,,Признаки';
 expect(await csv.preview(p.id,fixture)).toMatchObject({valid:[],duplicates:[2,3],errors:[]});
 const preview=await csv.preview(p.id,'de,ru,gender,example_de,example_ru\nKissen,подушка,n,Das Kissen ist weich.,Подушка мягкая.\n""\n"\n"\n""');
 expect(preview.errors.map(error=>error.line)).toEqual([3,4,6]);expect(preview.valid).toHaveLength(1);
 expect(await csv.commit(preview)).toEqual({added:1,duplicates:0,invalid:3});
 expect((await h.words.list(p.id,{query:'Kissen'}))[0]).toMatchObject({pos:'noun',gender:'n',exampleDe:'Das Kissen ist weich.',exampleRu:'Подушка мягкая.'});
 }finally{h.close();}
});

test('duplicate_joins_new_topic_without_reset',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 const word=await h.words.create(p.id,{de:'weich',ru:'мягкий',pos:'adjective',gender:null});
 const old=await h.topics.create(p.id,'Старый');await h.topics.setWordTopics(p.id,word.id,[old.id]);
 await h.db.run('UPDATE word_progress SET streak=3,totalErrors=2 WHERE profileId=? AND wordId=?',[p.id,word.id]);
 await h.db.run('UPDATE profiles SET xp=17 WHERE id=?',[p.id]);
 const before=await h.words.get(p.id,word.id),progress=await h.wordState(p.id,word.id);
 const preview=await csv.preview(p.id,'de,ru,pos,topic\nweich,мягкий,adjective,Новый');
 expect(await csv.commit(preview)).toEqual({added:0,duplicates:1,invalid:0});
 expect(await h.words.get(p.id,word.id)).toEqual(before);expect(await h.wordState(p.id,word.id)).toEqual(progress);expect((await h.profile(p.id))?.xp).toBe(17);
 expect((await h.topics.wordTopics(p.id,word.id)).map(t=>t.name).sort()).toEqual(['Новый','Старый']);
 }finally{h.close();}
});
test('same_csv_word_in_two_topics',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 expect(await csv.commit(await csv.preview(p.id,'de,ru,pos,topic\nweich,мягкий,adjective,Первый\nweich,мягкий,adjective,Второй'))).toEqual({added:1,duplicates:1,invalid:0});
 const words=await h.words.list(p.id,{query:'weich'});expect(words).toHaveLength(1);
 expect((await h.topics.wordTopics(p.id,words[0].id)).map(t=>t.name).sort()).toEqual(['Второй','Первый']);
 }finally{h.close();}
});
test('reimport_is_idempotent',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db),text='de,ru,pos,topic\nweich,мягкий,adjective,Первый\nweich,мягкий,adjective,Второй';
 await csv.commit(await csv.preview(p.id,text));const before=await snapshotDb(h.db);
 expect(await csv.commit(await csv.preview(p.id,text))).toEqual({added:0,duplicates:2,invalid:0});expect(await snapshotDb(h.db)).toEqual(before);
 }finally{h.close();}
});
test('topic_failure_rolls_back_import',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 await h.words.create(p.id,{de:'weich',ru:'мягкий',pos:'adjective',gender:null});
 const preview=await csv.preview(p.id,'de,ru,pos,topic\nhart,твёрдый,adjective,Первый\nweich,мягкий,adjective,Второй');
 await h.db.exec("CREATE TRIGGER fail_duplicate_topic BEFORE INSERT ON word_topics WHEN (SELECT de FROM words WHERE id=NEW.wordId)='weich' BEGIN SELECT RAISE(ABORT,'duplicate topic failure'); END;");
 const before=await snapshotDb(h.db);await expect(csv.commit(preview)).rejects.toThrow('duplicate topic failure');expect(await snapshotDb(h.db)).toEqual(before);
 }finally{h.close();}
});

test('non_noun_gender_and_plural_errors_keep_row_numbers',async()=>{
 const h=await createWordHarness();try{
 const p=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);
 const preview=await csv.preview(p.id,'de,ru,pos,gender,plural\ngehen,идти,verb,m,\nheute,сегодня,adverb,,heute');
 expect(preview.valid).toEqual([]);expect(preview.errors.map(error=>error.line)).toEqual([2,3]);
 expect(await csv.commit(preview)).toEqual({added:0,duplicates:0,invalid:2});
 }finally{h.close();}
});
