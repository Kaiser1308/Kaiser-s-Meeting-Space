import { describe, it, expect } from 'vitest';
import { app } from './app.js';

describe('API server structure', () => {
  it('resolves the app module without starting a listener', () => {
    expect(app).toBeDefined();
  });
});
