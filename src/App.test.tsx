import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('opens to an empty session with the sample button', () => {
  window.localStorage.clear();
  render(<App />);
  expect(screen.getByRole('button', { name: 'New here? Try a sample game' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Champions Won' })).toBeInTheDocument();
});
