import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authService from '@/services/auth.service';
import { useAuthStore } from './auth.store';

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
});

vi.mock('@/services/auth.service', () => ({
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  getMeApi: vi.fn(),
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    localStorage.clear();
  });

  it('khởi tạo với trạng thái chưa đăng nhập', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('đăng nhập thành công và lưu token vào store cùng localStorage', async () => {
    const mockResponse = {
      accessToken: 'valid-jwt-token',
      user: { id: 1, email: 'user@gmail.com', name: 'NGUYEN VAN A', loyaltyPoints: 100 },
    };
    vi.mocked(authService.loginApi).mockResolvedValue(mockResponse);

    const success = await useAuthStore.getState().login('user@gmail.com', 'password123');

    expect(success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('valid-jwt-token');
    expect(state.user).toEqual(mockResponse.user);
    expect(localStorage.getItem('brewlite_jwt_token')).toBe('valid-jwt-token');
  });

  it('xử lý khi đăng nhập thất bại và cập nhật lỗi', async () => {
    vi.mocked(authService.loginApi).mockRejectedValue(
      new Error('Email hoặc mật khẩu không chính xác.'),
    );

    const success = await useAuthStore.getState().login('user@brewlite.vn', 'wrongpass');

    expect(success).toBe(false);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Email hoặc mật khẩu không chính xác.');
  });

  it('đăng ký thành công nhưng giữ trạng thái chưa đăng nhập', async () => {
    const mockResponse = {
      message: 'Đăng ký tài khoản thành công. Vui lòng đăng nhập.',
      user: { id: 2, email: 'new@gmail.com', name: 'TRAN VAN B', loyaltyPoints: 0 },
    };
    vi.mocked(authService.registerApi).mockResolvedValue(mockResponse);

    localStorage.setItem('brewlite_jwt_token', 'stale-token');
    useAuthStore.setState({
      token: 'stale-token',
      user: { id: 1, email: 'user@gmail.com', name: 'NGUYEN VAN A', loyaltyPoints: 0 },
      isAuthenticated: true,
    });

    const success = await useAuthStore.getState().register('TRAN VAN B', 'new@gmail.com', 'password123');

    expect(success).toBe(true);
    const state = useAuthStore.getState();
    expect(authService.registerApi).toHaveBeenCalledWith('TRAN VAN B', 'new@gmail.com', 'password123');
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(localStorage.getItem('brewlite_jwt_token')).toBeNull();
  });

  it('đăng xuất xóa trạng thái và xoá token khỏi localStorage', () => {
    useAuthStore.setState({
      user: { id: 1, email: 'test@gmail.com', name: 'LE THI C', loyaltyPoints: 50 },
      token: 'some-token',
      isAuthenticated: true,
    });
    localStorage.setItem('brewlite_jwt_token', 'some-token');

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(localStorage.getItem('brewlite_jwt_token')).toBeNull();
  });

  it('bỏ qua kết quả phiên cũ thành công nếu người dùng đăng xuất trong lúc chờ', async () => {
    const request = createDeferred<{
      id: number;
      email: string;
      name: string;
      loyaltyPoints: number;
    }>();
    localStorage.setItem('brewlite_jwt_token', 'old-token');
    vi.mocked(authService.getMeApi).mockReturnValue(request.promise);

    const initialization = useAuthStore.getState().initialize();
    useAuthStore.getState().logout();
    request.resolve({
      id: 1,
      email: 'old@gmail.com',
      name: 'OLD USER',
      loyaltyPoints: 0,
    });
    await initialization;

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(localStorage.getItem('brewlite_jwt_token')).toBeNull();
  });

  it('không xóa token phiên mới nếu kiểm tra phiên cũ thất bại sau khi đăng xuất', async () => {
    const request = createDeferred<{
      id: number;
      email: string;
      name: string;
      loyaltyPoints: number;
    }>();
    localStorage.setItem('brewlite_jwt_token', 'old-token');
    vi.mocked(authService.getMeApi).mockReturnValue(request.promise);

    const initialization = useAuthStore.getState().initialize();
    useAuthStore.getState().logout();
    request.reject(new Error('Phiên cũ hết hạn.'));
    await initialization;

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(localStorage.getItem('brewlite_jwt_token')).toBeNull();
  });

  it('không ghi đè tài khoản mới khi kiểm tra phiên cũ thành công muộn', async () => {
    const request = createDeferred<{
      id: number;
      email: string;
      name: string;
      loyaltyPoints: number;
    }>();
    const newAccount = {
      accessToken: 'new-token',
      user: {
        id: 2,
        email: 'new@gmail.com',
        name: 'NEW USER',
        loyaltyPoints: 25,
      },
    };
    localStorage.setItem('brewlite_jwt_token', 'old-token');
    vi.mocked(authService.getMeApi).mockReturnValue(request.promise);
    vi.mocked(authService.loginApi).mockResolvedValue(newAccount);

    const initialization = useAuthStore.getState().initialize();
    await useAuthStore.getState().login('new@gmail.com', 'password123');
    request.resolve({
      id: 1,
      email: 'old@gmail.com',
      name: 'OLD USER',
      loyaltyPoints: 0,
    });
    await initialization;

    expect(useAuthStore.getState()).toMatchObject({
      user: newAccount.user,
      token: 'new-token',
      isAuthenticated: true,
    });
    expect(localStorage.getItem('brewlite_jwt_token')).toBe('new-token');
  });

  it('không xóa token hoặc tài khoản mới khi kiểm tra phiên cũ báo lỗi muộn', async () => {
    const request = createDeferred<{
      id: number;
      email: string;
      name: string;
      loyaltyPoints: number;
    }>();
    const newAccount = {
      accessToken: 'new-token',
      user: {
        id: 2,
        email: 'new@gmail.com',
        name: 'NEW USER',
        loyaltyPoints: 25,
      },
    };
    localStorage.setItem('brewlite_jwt_token', 'old-token');
    vi.mocked(authService.getMeApi).mockReturnValue(request.promise);
    vi.mocked(authService.loginApi).mockResolvedValue(newAccount);

    const initialization = useAuthStore.getState().initialize();
    await useAuthStore.getState().login('new@gmail.com', 'password123');
    request.reject(new Error('Phiên cũ hết hạn.'));
    await initialization;

    expect(useAuthStore.getState()).toMatchObject({
      user: newAccount.user,
      token: 'new-token',
      isAuthenticated: true,
    });
    expect(localStorage.getItem('brewlite_jwt_token')).toBe('new-token');
  });
});
