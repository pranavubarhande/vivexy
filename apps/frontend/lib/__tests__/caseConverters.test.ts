import { describe, it, expect } from 'vitest';
import { snakeToCamel, camelToSnake } from '../caseConverters';

describe('caseConverters', () => {
  describe('snakeToCamel', () => {
    it('should convert simple snake_case keys to camelCase', () => {
      const input = { first_name: 'John', last_name: 'Doe' };
      const expected = { firstName: 'John', lastName: 'Doe' };
      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('should convert nested objects', () => {
      const input = { user_details: { home_address: '123 St' } };
      const expected = { userDetails: { homeAddress: '123 St' } };
      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('should convert arrays of objects', () => {
      const input = [{ user_id: 1 }, { user_id: 2 }];
      const expected = [{ userId: 1 }, { userId: 2 }];
      expect(snakeToCamel(input)).toEqual(expected);
    });

    it('should handle primitives and null correctly', () => {
      expect(snakeToCamel(null)).toBeNull();
      expect(snakeToCamel('string')).toBe('string');
      expect(snakeToCamel(123)).toBe(123);
    });

    it('should ignore keys starting with an underscore', () => {
      const input = { _count: 10, normal_key: 'value' };
      const expected = { _count: 10, normalKey: 'value' };
      expect(snakeToCamel(input)).toEqual(expected);
    });
  });

  describe('camelToSnake', () => {
    it('should convert simple camelCase keys to snake_case', () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(camelToSnake(input)).toEqual(expected);
    });

    it('should convert nested objects', () => {
      const input = { userDetails: { homeAddress: '123 St' } };
      const expected = { user_details: { home_address: '123 St' } };
      expect(camelToSnake(input)).toEqual(expected);
    });

    it('should convert arrays of objects', () => {
      const input = [{ userId: 1 }, { userId: 2 }];
      const expected = [{ user_id: 1 }, { user_id: 2 }];
      expect(camelToSnake(input)).toEqual(expected);
    });

    it('should handle primitives and null correctly', () => {
      expect(camelToSnake(null)).toBeNull();
      expect(camelToSnake('string')).toBe('string');
      expect(camelToSnake(123)).toBe(123);
    });

    it('should ignore keys starting with an underscore', () => {
      const input = { _count: 10, normalKey: 'value' };
      const expected = { _count: 10, normal_key: 'value' };
      expect(camelToSnake(input)).toEqual(expected);
    });
  });
});
