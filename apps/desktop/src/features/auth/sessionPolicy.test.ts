import { DEFAULT_AUTO_LOCK_MINUTES, readAutoLockMinutes } from './sessionPolicy';

describe('readAutoLockMinutes', () => {
  it('aceita o intervalo persistido', () => {
    expect(readAutoLockMinutes({ autoLockMinutes: 45 })).toBe(45);
  });

  it.each([null, {}, { autoLockMinutes: 0 }, { autoLockMinutes: 121 }, { autoLockMinutes: '15' }])(
    'usa o padrão para valor inválido %#',
    (value) => {
      expect(readAutoLockMinutes(value)).toBe(DEFAULT_AUTO_LOCK_MINUTES);
    },
  );
});
