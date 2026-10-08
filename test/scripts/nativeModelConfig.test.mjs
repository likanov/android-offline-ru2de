import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const plugin = require('../../plugins/withOfflineAndroid.js');
test('Expo prebuild enables bundled llama sources and replaces stale property', async () => {
  const config = plugin({ name: 'test', slug: 'test' });
  assert.equal(typeof config.mods.android.gradleProperties, 'function', 'native source build must survive prebuild');
  const input = [{ type: 'property', key: 'rnllamaBuildFromSource', value: 'false' }, { type: 'property', key: 'hermesEnabled', value: 'true' }];
  const result = await config.mods.android.gradleProperties({ ...config, modResults: input, modRequest: {} });
  assert.deepEqual(result.modResults, [input[1], { type: 'property', key: 'rnllamaBuildFromSource', value: 'true' }]);
  const repeated = await config.mods.android.gradleProperties({ ...config, modResults: result.modResults, modRequest: {} });
  assert.deepEqual(repeated.modResults, result.modResults);
});
