import { createWordHarness } from '../harness';
import { CsvImportService } from '../../src/features/transfer/csvImportService';
import { createProfile, setActiveProfile } from '../../src/features/profiles/profileRepository';
import type { SqlStore } from '../../src/core/sql';
async function snapshotDb(db:SqlStore){const result:Record<string,unknown>={};for(const {name} of await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"))result[name]=await db.all(`SELECT * FROM "${name}" ORDER BY rowid`);return result;}
test('quoted_csv_unicode_and_profile_change',async()=>{
 const h=await createWordHarness();try{
 const p1=await createProfile(h.db,'A');const csv=new CsvImportService(h.db);
 const text='\uFEFFde,ru,pos,gender,note,topic\nStuhl,"стул, мягкий",noun,m,"строка 1\nстрока 2",Комната\nschön,красивый,adjective,,,\ngroß,большой,adjective,,,\ngross,большой,adjective,,,\ngroß,большой,adjective,,,\nTisch,стол,noun,,,\nleer,,adjective,,,\nx,y,verb,,,';
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
test('switching away and back requires a fresh preview',async()=>{
 const h=await createWordHarness();try{
 const p1=await createProfile(h.db,'A'),csv=new CsvImportService(h.db);const preview=await csv.preview(p1.id,'de,ru,pos\nweich,мягкий,adjective');
 await createProfile(h.db,'B');await setActiveProfile(h.db,p1.id);const before=await snapshotDb(h.db);
 await expect(csv.commit(preview)).rejects.toMatchObject({code:'WRONG_PROFILE'});expect(await snapshotDb(h.db)).toEqual(before);
 expect(await csv.commit(await csv.preview(p1.id,preview.sourceText))).toMatchObject({added:1});
 }finally{h.close();}
});
