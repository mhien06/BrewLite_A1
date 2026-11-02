export interface LoginErrorPlacement {
  emailError: string | null;
  passwordError: string | null;
  formError: string | null;
}

const INVALID_CREDENTIALS = "Email ho\u1eb7c m\u1eadt kh\u1ea9u kh\u00f4ng h\u1ee3p l\u1ec7.";

export function placeLoginError(message: string | null): LoginErrorPlacement {
  if (!message) {
    return { emailError: null, passwordError: null, formError: null };
  }
  if (message === INVALID_CREDENTIALS) {
    return { emailError: null, passwordError: null, formError: message };
  }
  if (/email|gmail/i.test(message)) {
    return { emailError: message, passwordError: null, formError: null };
  }
  if (/mật khẩu|password/i.test(message)) {
    return { emailError: null, passwordError: message, formError: null };
  }
  return { emailError: null, passwordError: null, formError: message };
}
