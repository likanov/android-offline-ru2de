import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function validateUpgradeSourceMap(map) {
  const errors=[],sources=Array.isArray(map?.sources)?map.sources:[];
  for(const name of ['/App.tsx','/src/app/navigation.tsx','/src/core/migrations/003_learning.ts'])if(!sources.includes(name))errors.push(`TASK5_SOURCE_MISSING:${name}`);
  for(const source of sources) {
    if(typeof source!=='string') {errors.push('SOURCE_MAP_INVALID');continue;}
    if((source.endsWith('/App.tsx')||source.includes('/src/'))&&!source.includes('/node_modules/')&&(!source.startsWith('/src/')&&source!=='/App.tsx'))errors.push(`SOURCE_OUTSIDE_CHECKOUT:${source}`);
    if(source.includes('/src/core/migrations/004_topics.ts'))errors.push('TOPIC_MIGRATION_IN_OLD_APK');
  }
  return {ok:errors.length===0,errors};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=validateUpgradeSourceMap(JSON.parse(readFileSync(process.argv[2],'utf8')));
  console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
}
