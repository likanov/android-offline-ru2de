import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GermanAnswerInput } from '../../src/ui/GermanAnswerInput';

test('visible_label_identifies_the_empty_answer_field', () => {
  render(<GermanAnswerInput onSubmit={jest.fn()} inputTestID="answer-input" submitTestID="answer-submit" />);
  expect(screen.getByText('Ответ на немецком')).toBeTruthy();
  const input = screen.getByLabelText('Ответ на немецком');
  expect(input.props.placeholder).toBe('Ваш ответ');
  expect(input.props.value).toBe('');
  expect(screen.queryByText('der Stuhl')).toBeNull();
});

test('blank_enter_does_not_submit', () => {
  const onSubmit = jest.fn();
  render(<GermanAnswerInput onSubmit={onSubmit} inputTestID="answer-input" submitTestID="answer-submit" />);
  const input = screen.getByLabelText('Ответ на немецком');
  fireEvent.changeText(input, '   ');
  fireEvent(input, 'submitEditing', { nativeEvent: { text: '   ' } });
  fireEvent.press(screen.getByTestId('answer-submit'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('button_and_enter_submit_the_same_value', () => {
  const onSubmit = jest.fn();
  const view = render(<GermanAnswerInput onSubmit={onSubmit} inputTestID="answer-input" submitTestID="answer-submit" />);
  const input = screen.getByLabelText('Ответ на немецком');
  fireEvent.changeText(input, 'das Buch');
  fireEvent(input, 'submitEditing', { nativeEvent: { text: 'das Buch' } });
  fireEvent.press(screen.getByTestId('answer-submit'));
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(onSubmit.mock.calls.map(([value]) => value)).toEqual(['das Buch', 'das Buch']);
  view.unmount();
});

test('disabled_input_cannot_submit', () => {
  const onSubmit = jest.fn();
  render(<GermanAnswerInput disabled onSubmit={onSubmit} inputTestID="answer-input" submitTestID="answer-submit" />);
  const input = screen.getByLabelText('Ответ на немецком');
  expect(input.props.editable).toBe(false);
  fireEvent.changeText(input, 'das Buch');
  fireEvent(input, 'submitEditing', { nativeEvent: { text: 'das Buch' } });
  fireEvent.press(screen.getByTestId('answer-submit'));
  expect(onSubmit).not.toHaveBeenCalled();
});
