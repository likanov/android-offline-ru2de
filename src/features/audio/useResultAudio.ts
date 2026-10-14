import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AudioService } from './audioService';

export type ResultAudioRequest = { key: string; text: string };

export function useResultAudio(audio: AudioService, request: ResultAudioRequest | null, visible: boolean): {
  repeat: () => void;
  stop: () => Promise<void>;
  unavailable: boolean;
} {
  const [failure, setFailure] = useState<{ key: string; text: string; audio: AudioService } | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const mounted = useRef(false);
  const generation = useRef(0);
  const owner = useRef<AudioService | null>(null);
  const playedKeys = useRef(new Set<string>());
  const current = useRef({ request, visible, active });
  useLayoutEffect(() => {
    current.current = { request, visible, active };
  }, [request, visible, active]);

  // Effect cleanup owns only result playback. A null result must leave listening alone.
  const invalidateOwned = useCallback(() => {
    generation.current++;
    const previous = owner.current;
    owner.current = null;
    if (previous) void previous.stop().catch(() => {});
  }, []);

  const stop = useCallback(async () => {
    generation.current++;
    owner.current = null;
    if (mounted.current) setFailure(null);
    try { await audio.stop(); } catch { /* Navigation never waits on a device error. */ }
  }, [audio]);

  const play = useCallback((result: ResultAudioRequest) => {
    const state = current.current;
    if (!mounted.current || !state.visible || !state.active || state.request?.key !== result.key) return;
    const playbackGeneration = ++generation.current;
    owner.current = audio;
    setFailure(null);
    void audio.playText(result.text).catch(error => {
      const latest = current.current;
      if (!mounted.current || playbackGeneration !== generation.current || !latest.visible || !latest.active ||
        latest.request?.key !== result.key || latest.request.text !== result.text) return;
      if ((error as { code?: string })?.code !== 'AUDIO_CANCELLED') setFailure({ ...result, audio });
    });
  }, [audio]);

  const repeat = useCallback(() => {
    const result = current.current.request;
    if (result) play(result);
  }, [play]);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      const isActive = state === 'active';
      current.current.active = isActive;
      if (!isActive) invalidateOwned();
      setActive(isActive);
    });
    return () => {
      mounted.current = false;
      invalidateOwned();
      subscription.remove();
    };
  }, [invalidateOwned]);

  const key = request?.key;
  const text = request?.text;
  useEffect(() => {
    if (active && visible && key !== undefined && text !== undefined && !playedKeys.current.has(key)) {
      playedKeys.current.add(key);
      play({ key, text });
    }
    return invalidateOwned;
  }, [active, visible, key, text, play, invalidateOwned]);

  const unavailable = visible && active && failure !== null && failure.audio === audio && failure.key === key && failure.text === text;
  return { repeat, stop, unavailable };
}
