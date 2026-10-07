import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../../src/ui/Button';

test.each(['secondary', 'ghost'] as const)('%s_variant_calls_the_same_callback', variant => {
  const onPress = jest.fn();
  render(<Button title="Действие" variant={variant} onPress={onPress} />);
  fireEvent.press(screen.getByRole('button', { name: 'Действие' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('disabled_button_does_not_call_callback_and_exposes_state', () => {
  const onPress = jest.fn();
  render(<Button title="Действие" variant="secondary" disabled onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Действие' });
  expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});
