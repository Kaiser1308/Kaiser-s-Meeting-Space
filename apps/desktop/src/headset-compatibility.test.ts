import { describe, expect, it } from 'vitest';
import { headsetCompatibilityWarning } from './headset-compatibility.js';

describe('headsetCompatibilityWarning', () => {
  it('warns when Bluetooth headset mic and headphones share a device name', () => {
    expect(
      headsetCompatibilityWarning(
        'Headset (2- soundcore R50i NC)',
        'Headphones (2- soundcore R50i NC)',
      ),
    ).toContain('No endpoint will be changed automatically');
  });

  it('does not warn for unrelated, default, or absent system endpoints', () => {
    expect(headsetCompatibilityWarning('USB microphone', 'Laptop speakers')).toBeNull();
    expect(headsetCompatibilityWarning('default', 'Headphones (2- soundcore R50i NC)')).toBeNull();
    expect(headsetCompatibilityWarning('Headset (2- soundcore R50i NC)', '')).toBeNull();
  });
});
