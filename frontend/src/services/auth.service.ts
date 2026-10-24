import { AuthResponse, RegisterResponse, User } from '@/types/auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

async function parseErrorMessage(res: Response, defaultMessage: string): Promise<string> {
  try {
    const errorData = await res.json();
    if (typeof errorData.message === 'string') {
      return errorData.message;
    }
    if (Array.isArray(errorData.message) && errorData.message.length > 0) {
      return errorData.message.join(', ');
    }
  } catch {
    // ignore parse error
  }
  return defaultMessage;
}

export async function registerApi(
  name: string,
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/auth/register`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
  });

  if (!res.ok) {
    const message = await parseErrorMessage(
      res,
      'Đăng ký tài khoản thất bại. Vui lòng thử lại.',
    );
    throw new AuthServiceError(message, res.status);
  }

  return res.json();
}

export async function loginApi(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/auth/login`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const message = await parseErrorMessage(
      res,
      'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.',
    );
    throw new AuthServiceError(message, res.status);
  }

  return res.json();
}

export async function getMeApi(token: string): Promise<User> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/auth/me`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new AuthServiceError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', res.status);
  }

  return res.json();
}
