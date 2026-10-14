import React, { useState } from 'react';
import { AppState, type AppStateStatus, Pressable, Text } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AudioService, AudioCancelledError, type AudioPlayer, type OfflineSpeech, type OfflineVoice } from '../../src/features/audio/audioService';
import type { ResultAudioRequest } from '../../src/features/audio/useResultAudio';
import { useResultAudio } from '../../src/features/audio/useResultAudio';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const voices: OfflineVoice[] = [{ id: 'de', language: 'de-DE', installed: true, requiresNetwork: false }];
function deviceAudio() {
  const spoken: string[] = [];
  let speechStops = 0;
  let playerStops = 0;
  let stopFailure = false;
  const lookups: Promise<OfflineVoice[]>[] = [];
  const completions: Promise<void>[] = [];
  const speech: OfflineSpeech = {
    listVoices: async () => lookups.shift() ?? voices,
    speakOffline: async text => { spoken.push(text); await completions.shift(); },
    stopSpeech: async () => { speechStops++; if (stopFailure) throw new Error('Device stop failed'); },
  };
  const player: AudioPlayer = {
    play: async () => {},
    stop: async () => { playerStops++; if (stopFailure) throw new Error('Device stop failed'); },
  };
  const audio = new AudioService([], speech, player);
  const playText = jest.spyOn(audio, 'playText'); // Observes the real service; does not replace it.
  return { audio, spoken, playText, lookups, completions, failStop: () => { stopFailure = true; }, stops: () => ({ speechStops, playerStops }) };
}
const first: ResultAudioRequest = { key: JSON.stringify(['p', 'a']), text: 'der Stuhl' };
const second: ResultAudioRequest = { key: JSON.stringify(['p', 'b']), text: 'die Lampe' };
function Host({ audio, request = first, visible = true }: { audio: AudioService; request?: ResultAudioRequest | null; visible?: boolean }) {
  const [continued, setContinued] = useState(false);
  const { repeat, stop, unavailable } = useResultAudio(audio, continued ? null : request, visible);
  return <>
    <Text>{unavailable ? 'Офлайн-озвучка недоступна.' : 'Audio ready'}</Text>
    <Text>{continued ? 'Next question' : 'Result'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Repeat" onPress={repeat}><Text>Repeat</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={() => { void stop(); }}><Text>Stop</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={() => { setContinued(true); void stop(); }}><Text>Continue</Text></Pressable>
  </>;
}
let appChange: (state: AppStateStatus) => void;
let removed: boolean;
let originalState: AppStateStatus;
beforeEach(() => {
  originalState = AppState.currentState;
  AppState.currentState = 'active';
  removed = false;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appChange = handler;
    return { remove: () => { removed = true; } };
  });
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); AppState.currentState = originalState; });
const flush = async () => { await act(async () => {}); };

test('a restored eligible result starts once, rerenders stay silent, and a new key plays', async () => {
  const device = deviceAudio();
  const view = render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  view.rerender(<Host audio={device.audio} request={{ ...first }} />);
  await flush();
  expect(device.playText).toHaveBeenCalledTimes(1);
  view.rerender(<Host audio={device.audio} request={second} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl', 'die Lampe']));
  expect(device.playText).toHaveBeenCalledTimes(2);
  view.rerender(<Host audio={device.audio} request={first} />);
  await flush();
  expect(device.playText).toHaveBeenCalledTimes(2);
});

test('null results and their rerenders leave existing listening playback alone', async () => {
  const device = deviceAudio();
  const lookup = deferred<OfflineVoice[]>();
  device.lookups.push(lookup.promise);
  const listening = device.audio.play({ id: 'w', profileId: 'p', de: 'Stuhl', ru: 'стул', pos: 'noun', gender: 'm', plural: null, exampleDe: null, exampleRu: null, note: '' });
  await flush();
  const view = render(<Host audio={device.audio} request={null} />);
  view.rerender(<Host audio={device.audio} request={null} />);
  await act(async () => { lookup.resolve(voices); await listening; });
  expect(device.spoken).toEqual(['der Stuhl']);
  expect(device.stops()).toEqual({ speechStops: 1, playerStops: 1 });
  view.rerender(<Host audio={device.audio} request={first} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl', 'der Stuhl']));
});

test('Repeat interrupts pending playback and restarts the current text', async () => {
  const device = deviceAudio();
  const pending = deferred<void>();
  device.completions.push(pending.promise);
  render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  fireEvent.press(screen.getByRole('button', { name: 'Repeat' }));
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl', 'der Stuhl']));
  expect(device.stops()).toEqual({ speechStops: 2, playerStops: 2 });
  await act(async () => { pending.reject(new Error('Old native failure')); });
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  expect(device.stops()).toEqual({ speechStops: 2, playerStops: 2 });
});

test('explicit Stop invalidates immediately and never triggers automatic replay', async () => {
  const device = deviceAudio();
  const lookup = deferred<OfflineVoice[]>();
  device.lookups.push(lookup.promise);
  const view = render(<Host audio={device.audio} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
  view.rerender(<Host audio={device.audio} request={{ ...first }} />);
  await act(async () => { lookup.resolve(voices); });
  expect(device.spoken).toEqual([]);
  expect(device.playText).toHaveBeenCalledTimes(1);
  expect(device.stops()).toEqual({ speechStops: 2, playerStops: 2 });
});

test('a pending playback promise does not hold Continue', async () => {
  const device = deviceAudio();
  const lookup = deferred<OfflineVoice[]>();
  device.lookups.push(lookup.promise);
  render(<Host audio={device.audio} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Next question')).toBeTruthy();
  await act(async () => { lookup.resolve(voices); });
  expect(device.spoken).toEqual([]);
});

test.each(['resolve', 'reject'] as const)('late voice %s after stopping cannot restart or show failure', async settlement => {
  const device = deviceAudio();
  const lookup = deferred<OfflineVoice[]>();
  device.lookups.push(lookup.promise);
  render(<Host audio={device.audio} />);
  await flush();
  fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
  const stops = device.stops();
  await act(async () => { if (settlement === 'resolve') lookup.resolve(voices); else lookup.reject(new Error('Old lookup failure')); });
  expect(device.spoken).toEqual([]);
  expect(device.stops()).toEqual(stops);
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});

test.each([
  ['attempt', 'resolve'], ['attempt', 'reject'], ['profile', 'resolve'], ['profile', 'reject'],
] as const)('a changed %s key owns playback when an old native promise %ss', async (change, settlement) => {
  const device = deviceAudio();
  const pending = deferred<void>();
  device.completions.push(pending.promise);
  const view = render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  const next = change === 'profile' ? { ...second, key: JSON.stringify(['new-profile', 'a']) } : second;
  view.rerender(<Host audio={device.audio} request={next} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl', 'die Lampe']));
  const stops = device.stops();
  await act(async () => { if (settlement === 'resolve') pending.resolve(); else pending.reject(new Error('Previous result failed')); });
  expect(device.stops()).toEqual(stops);
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});

test.each([
  ['hidden', 'resolve'], ['hidden', 'reject'], ['background', 'resolve'], ['background', 'reject'], ['unmount', 'resolve'], ['unmount', 'reject'],
] as const)('late lookup after %s cannot speak or report a failure when it %ss', async (reason, settlement) => {
  const device = deviceAudio();
  const lookup = deferred<OfflineVoice[]>();
  device.lookups.push(lookup.promise);
  const view = render(<Host audio={device.audio} />);
  await flush();
  if (reason === 'hidden') view.rerender(<Host audio={device.audio} visible={false} />);
  else if (reason === 'background') act(() => { appChange('background'); });
  else view.unmount();
  await act(async () => { if (settlement === 'resolve') lookup.resolve(voices); else lookup.reject(new Error('Previous lookup failed')); });
  expect(device.spoken).toEqual([]);
  expect(device.stops()).toEqual({ speechStops: 2, playerStops: 2 });
  if (reason === 'unmount') expect(removed).toBe(true);
  else {
    if (reason === 'hidden') view.rerender(<Host audio={device.audio} />);
    else act(() => { appChange('active'); });
    await flush();
    expect(device.playText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
  }
});

test.each([
  ['hidden', 'resolve'], ['hidden', 'reject'], ['background', 'resolve'], ['background', 'reject'], ['unmount', 'resolve'], ['unmount', 'reject'],
] as const)('late speech after %s stays silent when it %ss', async (reason, settlement) => {
  const device = deviceAudio();
  const pending = deferred<void>();
  device.completions.push(pending.promise);
  const view = render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  if (reason === 'hidden') view.rerender(<Host audio={device.audio} visible={false} />);
  else if (reason === 'background') act(() => { appChange('background'); });
  else view.unmount();
  const stops = device.stops();
  await act(async () => { if (settlement === 'resolve') pending.resolve(); else pending.reject(new Error('Late speech failure')); });
  expect(device.spoken).toEqual(['der Stuhl']);
  expect(device.stops()).toEqual(stops);
  if (reason !== 'unmount') expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});

test.each(['hidden', 'background'] as const)('a never-played result first plays when it becomes eligible from %s', async reason => {
  const device = deviceAudio();
  if (reason === 'background') AppState.currentState = 'background';
  const view = render(<Host audio={device.audio} visible={reason !== 'hidden'} />);
  await flush();
  expect(device.playText).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Repeat' }));
  expect(device.playText).not.toHaveBeenCalled();
  if (reason === 'hidden') view.rerender(<Host audio={device.audio} />);
  else act(() => { appChange('active'); });
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
});

test.each(['missing-voice', 'speech-failure'] as const)('current %s shows only local unavailable feedback and Continue remains usable', async failure => {
  const device = deviceAudio();
  const pending = deferred<void>();
  if (failure === 'missing-voice') device.lookups.push(Promise.resolve([]));
  else device.completions.push(pending.promise);
  render(<Host audio={device.audio} />);
  if (failure === 'speech-failure') {
    await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
    await act(async () => { pending.reject(new Error('Native synthesis failed')); });
  }
  expect(await screen.findByText('Офлайн-озвучка недоступна.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByText('Next question')).toBeTruthy();
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});

test('native cancellation is silent for the current result', async () => {
  const device = deviceAudio();
  const pending = deferred<void>();
  device.completions.push(pending.promise);
  render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  await act(async () => { pending.reject(new AudioCancelledError()); });
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});

test('native Stop failure is absorbed so navigation still completes', async () => {
  const device = deviceAudio();
  const pending = deferred<void>();
  device.completions.push(pending.promise);
  render(<Host audio={device.audio} />);
  await waitFor(() => expect(device.spoken).toEqual(['der Stuhl']));
  device.failStop();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await flush();
  expect(screen.getByText('Next question')).toBeTruthy();
  await act(async () => { pending.reject(new Error('Stopped speech failed')); });
  expect(screen.queryByText('Офлайн-озвучка недоступна.')).toBeNull();
});
