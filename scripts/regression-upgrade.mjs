// The exported checkpoints come from Android's public backup picker. No private
// database is pulled, replaced, or injected during an upgrade regression.
export async function runRetainedUpgrade({schema,previousApk,finalApk,install,launch,flow,capture,prepareClock=()=>{}}) {
 if(![5,6].includes(schema)||!previousApk||previousApk===finalApk)throw Error('UPGRADE_INPUT_INVALID');
 await prepareClock({relaunchApp:false});
 await install(previousApk,false);
 await flow('upgrade-before');
 if(schema===6)await flow('schema6-grammar-before');
 const before=await capture(`schema${schema}-before`);
 await installReplacementAndLaunch({finalApk,install,launch});
 const after=await capture(`schema${schema}-after`);
 return {before,after};
}

// Both catalog and original Task5 replacements can return Android to the launcher.
export async function installReplacementAndLaunch({finalApk,install,launch}) {
 await install(finalApk,true);
 await launch();
}
