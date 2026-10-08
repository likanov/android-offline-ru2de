// The exported checkpoints come from Android's public backup picker. No private
// database is pulled, replaced, or injected during an upgrade regression.
export async function runRetainedUpgrade({schema,previousApk,finalApk,install,flow,capture}) {
 if(![5,6].includes(schema)||!previousApk||previousApk===finalApk)throw Error('UPGRADE_INPUT_INVALID');
 await install(previousApk,false);
 await flow('upgrade-before');
 if(schema===6)await flow('schema6-grammar-before');
 const before=await capture(`schema${schema}-before`);
 await install(finalApk,true);
 const after=await capture(`schema${schema}-after`);
 return {before,after};
}
