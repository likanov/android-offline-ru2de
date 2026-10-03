import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {starterWords} from '../../src/data/starterWords';
import {displayGerman} from '../../src/features/dictionary/wordValidation';
import type {Word} from '../../src/features/learning/learningTypes';
import {audioManifest, audioSources} from '../../src/features/audio/audioManifest';
test('all_40_starter_recordings_are_bundled_nonempty_and_match_current_text',()=>{
 expect(audioManifest.recordings).toHaveLength(40);expect(Object.keys(audioSources)).toHaveLength(40);
 for(const word of starterWords){
  const entry=audioManifest.recordings.find(r=>r.seedKey===word.seedKey)!;
  expect(entry.text).toBe(displayGerman(word as unknown as Word));expect(audioSources[word.seedKey]).toBeDefined();
  const wav=readFileSync(join(__dirname,'../../assets/audio',entry.file));expect(wav.toString('ascii',0,4)).toBe('RIFF');expect(wav.length).toBeGreaterThan(1000);
  expect(createHash('sha256').update(wav).digest('hex')).toBe(entry.sha256);
 }
});
