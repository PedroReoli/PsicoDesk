import { describe, expect, it } from 'vitest';
import { percentage } from './report.types';
describe('percentage', () => {
  it('evita divisão por zero', () => {
    expect(percentage(10, 0)).toBe(0);
  });
  it('limita o valor visual a 100%', () => {
    expect(percentage(150, 100)).toBe(100);
  });
});
