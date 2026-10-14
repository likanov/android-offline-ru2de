import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

test('an app remount can read persisted SQLite data after the old native wrapper is collected',async()=>{
 const root=mkdtempSync(tmpdir()+'/sql-lifecycle-'),sdk=root+'/native-sdk.mjs';
 // Match expo-sqlite 56.0.6's cached native binding and Android GC release hook.
 // Real SQLite verifies that owned connections still use the same persisted file.
 writeFileSync(sdk,`
 import {DatabaseSync} from 'node:sqlite';
 const connections=new Set();let cached;
 export const wrappers=[];let failSetup=false;export let closedCount=0;export function failNextSetup(){failSetup=true;}
 export async function openDatabaseAsync(name,options){
  const binding=options?.useNewConnection?undefined:cached;
  const current=binding??{valid:true,closed:false,db:new DatabaseSync(${JSON.stringify(root)}+'/'+name)};
  connections.add(current);if(!options?.useNewConnection)cached=current;
  const check=()=>{if(!current.valid)throw Error('NativeDatabase.prepareAsync: java.lang.NullPointerException');};
  wrappers.push({collect:()=>{current.valid=false;}});
  return {
   execAsync:async sql=>{check();if(failSetup){failSetup=false;throw Error('setup failed');}current.db.exec(sql);},
   closeAsync:async()=>{if(!current.closed){current.closed=true;current.db.close();closedCount++;}},
   runAsync:async(sql,params=[])=>{check();const r=current.db.prepare(sql).run(...params);return {changes:Number(r.changes),lastInsertRowId:Number(r.lastInsertRowid)};},
   getAllAsync:async(sql,params=[])=>{check();return current.db.prepare(sql).all(...params).map(row=>({...row}));},
   getFirstAsync:async(sql,params=[])=>{check();const row=current.db.prepare(sql).get(...params);return row?{...row}:null;},
   withExclusiveTransactionAsync:async()=>{throw Error('not used by this lifecycle read/write probe');}
  };
 }
 export function closeConnections(){for(const c of connections)if(!c.closed)c.db.close();}
 `);
 const url=pathToFileURL(sdk).href;
 const hooks=registerHooks({resolve(specifier,context,next){return specifier==='expo-sqlite'?{url,shortCircuit:true}:next(specifier,context);}});
 let native;
 try{
  const {openAppDb}=await import('../../src/core/sql.ts');native=await import('expo-sqlite');
  let oldRoot=await openAppDb();
  await oldRoot.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,name TEXT)');
  await oldRoot.run('INSERT INTO profiles VALUES (?,?)',['p','Fixture']);
  const activeRoot=await openAppDb();
  oldRoot=null;
  native.wrappers[0].collect();
  assert.deepEqual(await activeRoot.all('SELECT id,name FROM profiles'),[{id:'p',name:'Fixture'}]);
  await activeRoot.run('INSERT INTO profiles VALUES (?,?)',['p2','After remount']);
  assert.equal((await activeRoot.all('SELECT * FROM profiles')).length,2);
  await activeRoot.dispose();await activeRoot.dispose();assert.equal(native.closedCount,1);
  native.failNextSetup();await assert.rejects(openAppDb(),/setup failed/);assert.equal(native.closedCount,2);
 }finally{native?.closeConnections();hooks.deregister();rmSync(root,{recursive:true,force:true});}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('disposal cancels queued reads, waits for active work, closes once, and rejects later calls',async()=>{
 const {createSqlStore}=await import('../../src/core/sql.ts');
 const active=deferred(),events=[];
 const native={execAsync:async()=>{events.push('active');await active.promise;events.push('finished');},getAllAsync:async()=>{events.push('read');return [];}};
 const db=createSqlStore(native,async()=>{events.push('close');});
 const started=db.exec('active');await Promise.resolve();
 const queued=db.all('queued');let observedCancellation=false;const cancelled=assert.rejects(queued,/disposed/i).then(()=>{observedCancellation=true;});
 const closing=db.dispose();
 await assert.rejects(db.first('late'),/disposed/i);
 assert.deepEqual(events,['active']);
 await new Promise(resolve=>setImmediate(resolve));
 try{
  assert.equal(observedCancellation,true,'queued caller rejects while active work remains blocked');
  await cancelled;assert.deepEqual(events,['active']);
 }finally{active.resolve();await started;await closing;}
 await db.dispose();
 assert.deepEqual(events,['active','finished','close']);
 await assert.rejects(db.transaction(async()=>{}),/disposed/i);
 await assert.rejects(db.schemaTransaction(async()=>{}),/disposed/i);
});

for(const phase of ['ready','opening','migrating','failed'])test(`AppRoot database cleanup covers ${phase}`,async()=>{
 const {mountAppDatabase}=await import('../../src/app/databaseLifecycle.ts');
 const opening=deferred(),migration=deferred(),ready=deferred(),done=deferred();let closes=0,migrations=0,readies=0,errors=0;
 const db={dispose:async()=>{closes++;done.resolve();}};
 const cleanup=mountAppDatabase({open:()=>opening.promise,migrate:async()=>{migrations++;if(phase==='failed')throw Error('migration failed');await migration.promise;},onReady:()=>{readies++;ready.resolve();},onError:()=>{errors++;ready.resolve();}});
 if(phase==='opening')cleanup();
 opening.resolve(db);await Promise.resolve();await Promise.resolve();
 if(phase==='migrating')cleanup();
 migration.resolve();
 if(phase==='ready'){await ready.promise;cleanup();}
 if(phase==='failed')await ready.promise;
 await done.promise;await Promise.resolve();cleanup();
 assert.equal(closes,1);assert.equal(readies,phase==='ready'?1:0);assert.equal(errors,phase==='failed'?1:0);assert.equal(migrations,phase==='opening'?0:1);
});
