import { describe, it, expect } from 'vitest';
import { cn, slugify, generateRandomToken } from '../common';

describe('common utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
      expect(cn('bg-red-500', { 'text-white': true, 'font-bold': false })).toBe(
        'bg-red-500 text-white'
      );
    });
  });

  describe('slugify', () => {
    it('should convert text to slug format', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test@#$ Title!!!')).toBe('test-title');
      expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
      expect(slugify('Casing-Test-123')).toBe('casing-test-123');
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a token of default length 32', () => {
      const token = generateRandomToken();
      expect(token).toHaveLength(32);
      expect(typeof token).toBe('string');
    });

    it('should generate a token of specified length', () => {
      const token = generateRandomToken(16);
      expect(token).toHaveLength(16);
    });
  });
});
