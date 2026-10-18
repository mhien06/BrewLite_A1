import { Product } from '@/types/product';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ProductsServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProductsServiceError';
  }
}

function isValidProduct(item: unknown): item is Product {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.name === 'string' &&
    typeof candidate.price === 'number' &&
    typeof candidate.stock === 'number' &&
    typeof candidate.imageUrl === 'string'
  );
}

export async function getProducts(): Promise<Product[]> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/products`;

  try {
    const res = await fetch(endpoint, {
      // Avoid stale cache for menu items
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new ProductsServiceError(
        `Không thể tải danh sách sản phẩm (Mã lỗi: ${res.status} ${res.statusText})`,
        res.status,
      );
    }

    const data: unknown = await res.json();

    if (!Array.isArray(data) || !data.every(isValidProduct)) {
      throw new ProductsServiceError('Dữ liệu sản phẩm trả về không đúng cấu trúc');
    }

    return data;
  } catch (error) {
    if (error instanceof ProductsServiceError) {
      throw error;
    }

    const errorMsg =
      error instanceof Error ? error.message : 'Lỗi không xác định';
    throw new ProductsServiceError(
      `Lỗi kết nối tới máy chủ (${endpoint}): ${errorMsg}`,
    );
  }
}

export async function getProduct(id: number): Promise<Product> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}/products/${id}`;

  try {
    const res = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new ProductsServiceError(
        `Không thể tải sản phẩm (Mã lỗi: ${res.status} ${res.statusText})`,
        res.status,
      );
    }

    const data: unknown = await res.json();
    if (!isValidProduct(data)) {
      throw new ProductsServiceError('Dữ liệu sản phẩm trả về không đúng cấu trúc');
    }

    return data;
  } catch (error) {
    if (error instanceof ProductsServiceError) {
      throw error;
    }

    const errorMsg = error instanceof Error ? error.message : 'Lỗi không xác định';
    throw new ProductsServiceError(
      `Lỗi kết nối tới máy chủ (${endpoint}): ${errorMsg}`,
    );
  }
}
