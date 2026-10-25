import { describe, expect, it } from 'vitest';
import { getJwtSecret } from './jwt-secret.js';

describe('getJwtSecret', () => {
  it('throws when JWT_SECRET is missing', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      expect(() => getJwtSecret()).toThrow(
        'JWT_SECRET must be set to a private value before starting the application.',
      );
    } finally {
      if (originalSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalSecret;
      }
    }
  });

  it('throws when JWT_SECRET still has the example placeholder', () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'change-me-to-a-long-random-string';

    try {
      expect(() => getJwtSecret()).toThrow(
        'JWT_SECRET must be set to a private value before starting the application.',
      );
    } finally {
      if (originalSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalSecret;
      }
    }
  });
});
