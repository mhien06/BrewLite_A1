import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginApi } from './auth.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loginApi error classification', () => {
  it('keeps API email validation errors as email errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Email ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng @gmail.com.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(loginApi('review@outlook.com', 'secret')).rejects.toMatchObject({
      name: 'AuthServiceError',
      message: 'Email ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng @gmail.com.',
      status: 400,
    });
  });

  it('normalizes invalid credentials without exposing which value failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(loginApi('unregistered@gmail.com', 'secret')).rejects.toMatchObject({
      name: 'AuthServiceError',
      message: 'Email ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng h\u1ee3p l\u1ec7.',
      status: 401,
    });
  });

  it('reports network failures as connection errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(loginApi('user@gmail.com', 'secret')).rejects.toMatchObject({
      name: 'AuthServiceError',
      message: 'Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i m\u00e1y ch\u1ee7. Vui l\u00f2ng th\u1eed l\u1ea1i.',
      status: undefined,
    });
  });
});
