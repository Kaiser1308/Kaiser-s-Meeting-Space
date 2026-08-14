import { describe, it, expect } from 'vitest';
import { MinutesEditorRepository } from '../src/repositories/minutes-editor.js';
import { minutesEditorVersions, minutesEditorCurrent } from '../src/schema/minutes-editor.js';

describe('MinutesEditorRepository wiring', () => {
  it('exports the repository class', () => {
    expect(typeof MinutesEditorRepository).toBe('function');
  });
  it('has the save/get/list/setCurrent/getCurrent methods', () => {
    const repo = new MinutesEditorRepository();
    expect(typeof repo.saveVersion).toBe('function');
    expect(typeof repo.getVersion).toBe('function');
    expect(typeof repo.listVersions).toBe('function');
    expect(typeof repo.setCurrent).toBe('function');
    expect(typeof repo.getCurrent).toBe('function');
  });
  it('exposes the version and current tables', () => {
    expect(minutesEditorVersions).toBeTruthy();
    expect(minutesEditorCurrent).toBeTruthy();
  });
});
