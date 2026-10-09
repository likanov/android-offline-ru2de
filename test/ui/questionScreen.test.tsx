import React, { useEffect, useRef } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QuestionScreen, useQuestionInputReveal } from '../../src/ui/QuestionScreen';

function MeasuredAnswer({ onReady }: { onReady(node: View): void }) {
  const ref = useRef<View>(null);
  const reveal = useQuestionInputReveal();
  useEffect(() => {
    if (ref.current) {
      onReady(ref.current);
      reveal(ref.current);
    }
    return () => reveal(null);
  }, [onReady, reveal]);
  return <View testID="answer-group" ref={ref} />;
}

beforeEach(() => jest.restoreAllMocks());

test('reveals_answer_group_after_keyboard_resize', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  screen.UNSAFE_getByType(ScrollView).instance.getNativeScrollRef = () => screen.UNSAFE_getByType(ScrollView).instance;
  screen.UNSAFE_getByType(ScrollView).instance.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, 340);
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 340 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 220, 320, 170);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  expect(keyboardEvent).toBeTruthy();
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } }); });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 58, animated: true });
});

test('does_not_scroll_an_already_visible_answer', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  screen.UNSAFE_getByType(ScrollView).instance.getNativeScrollRef = () => screen.UNSAFE_getByType(ScrollView).instance;
  screen.UNSAFE_getByType(ScrollView).instance.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, 340);
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 340 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 100, 320, 100);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } }); });
  expect(scrollTo).not.toHaveBeenCalled();
});

test('late_keyboard_event_after_unmount_is_ignored', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  const view = render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  view.unmount();
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } }); });
  expect(scrollTo).not.toHaveBeenCalled();
  void target;
});

test('reconciles_answer_visibility_when_native_content_layout_finishes_after_keyboard_resize', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  screen.UNSAFE_getByType(ScrollView).instance.getNativeScrollRef = () => screen.UNSAFE_getByType(ScrollView).instance;
  screen.UNSAFE_getByType(ScrollView).instance.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 320, 340);
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 340 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 220, 320, 170);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } }); });
  // Android can clamp an early request against the previous native content size.
  // The next committed content layout must reveal using the actual offset (0).
  scrollTo.mockClear();
  fireEvent(scroll, 'contentSizeChange', 320, 600);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 58, animated: true });
});

test('measures_the_visible_viewport_in_the_same_window_coordinates_as_the_answer', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  screen.UNSAFE_getByType(ScrollView).instance.getNativeScrollRef = () => screen.UNSAFE_getByType(ScrollView).instance;
  screen.UNSAFE_getByType(ScrollView).instance.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 100, 320, 240);
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 240 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 220, 320, 170);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } }); });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 58, animated: true });
});

test('creates_native_scroll_range_when_keyboard_overlays_content_shorter_than_the_full_viewport', () => {
  let target: View | undefined;
  let actualOffset = 0;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn(({ y }: { y: number }) => {
    const padding = StyleSheet.flatten(screen.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom;
    actualOffset = Math.min(y, Math.max(0, 556.33 + padding - 16 - 640));
  });
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  screen.UNSAFE_getByType(ScrollView).instance.getNativeScrollRef = () => screen.UNSAFE_getByType(ScrollView).instance;
  screen.UNSAFE_getByType(ScrollView).instance.measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, -53, 360, 640);
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 640 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 137.67 - actualOffset, 360, 213.67);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  act(() => { (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 341 } }); });
  fireEvent(scroll, 'contentSizeChange', 360, 802.33);
  expect(137.67 + 213.67 - actualOffset).toBeLessThanOrEqual(333);
});
