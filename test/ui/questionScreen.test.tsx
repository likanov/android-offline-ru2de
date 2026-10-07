import React, { useEffect, useRef } from 'react';
import { Keyboard, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 340 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 220, 320, 170);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  expect(keyboardEvent).toBeTruthy();
  (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 58, animated: true });
});

test('does_not_scroll_an_already_visible_answer', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const scroll = screen.getByTestId('screen-scroll');
  fireEvent(scroll, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 340 } } });
  (target as any).measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 100, 320, 100);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } });
  expect(scrollTo).not.toHaveBeenCalled();
});

test('late_keyboard_event_after_unmount_is_ignored', () => {
  let target: View | undefined;
  const addListener = jest.spyOn(Keyboard, 'addListener');
  const scrollTo = jest.fn();
  const view = render(<QuestionScreen onScrollTo={scrollTo}><MeasuredAnswer onReady={node => { target = node; }} /></QuestionScreen>);
  const keyboardEvent = addListener.mock.calls.find(([name]) => name === 'keyboardDidShow');
  view.unmount();
  (keyboardEvent![1] as (event: { endCoordinates: { screenY: number } }) => void)({ endCoordinates: { screenY: 340 } });
  expect(scrollTo).not.toHaveBeenCalled();
  void target;
});
