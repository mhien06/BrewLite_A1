import { describe, expect, it } from 'vitest';
import { placeLoginError } from './login-errors';

describe('placeLoginError', () => {
  it('places API email validation errors below the email field', () => {
    const message = 'Email ph\u1ea3i c\u00f3 \u0111\u1ecbnh d\u1ea1ng @gmail.com.';
    expect(placeLoginError(message)).toEqual({ emailError: message, passwordError: null, formError: null });
  });

  it('places invalid credentials below password without identifying the account field', () => {
    const message = 'Email ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng h\u1ee3p l\u1ec7.';
    expect(placeLoginError(message)).toEqual({ emailError: null, passwordError: message, formError: null });
  });

  it('keeps connection errors in the form level error area', () => {
    const message = 'Kh\u00f4ng th\u1ec3 k\u1ebft n\u1ed1i m\u00e1y ch\u1ee7. Vui l\u00f2ng th\u1eed l\u1ea1i.';
    expect(placeLoginError(message)).toEqual({ emailError: null, passwordError: null, formError: message });
  });
});
