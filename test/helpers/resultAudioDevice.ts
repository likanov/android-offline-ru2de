import { AudioService, type OfflineVoice } from '../../src/features/audio/audioService';

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const germanVoices: OfflineVoice[] = [{ id: 'offline-de', language: 'de-DE', installed: true, requiresNetwork: false }];
// Only native device boundaries are replaced; playback and cancellation stay real.
export function resultAudioDevice() {
  const spoken: string[] = [];
  const lookups: Promise<OfflineVoice[]>[] = [];
  const completions: Promise<void>[] = [];
  let speechStops = 0;
  let playerStops = 0;
  let stopFailure = false;
  const audio = new AudioService([], {
    listVoices: async () => lookups.shift() ?? germanVoices,
    speakOffline: async text => { spoken.push(text); await completions.shift(); },
    stopSpeech: async () => { speechStops++; if (stopFailure) throw new Error('Native stop failed'); },
  }, {
    play: async () => {},
    stop: async () => { playerStops++; if (stopFailure) throw new Error('Native stop failed'); },
  });
  return { audio, spoken, lookups, completions, stops: () => ({ speechStops, playerStops }), failStop: () => { stopFailure = true; } };
}
