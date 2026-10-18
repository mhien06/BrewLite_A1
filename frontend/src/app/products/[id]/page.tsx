import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductOptions from '@/components/ProductOptions';
import { getProduct, ProductsServiceError } from '@/services/products.service';

interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}

// Product data is always read fresh from the NestJS API for this request.
export const instant = false;

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId <= 0) {
    notFound();
  }

  let product;
  try {
    product = await getProduct(productId);
  } catch (error) {
    if (error instanceof ProductsServiceError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 hover:text-amber-950"
      >
        <span aria-hidden="true">←</span> Quay lại thực đơn
      </Link>

      <article className="mt-5 overflow-hidden rounded-3xl border border-amber-900/10 bg-white shadow-xl shadow-amber-950/10 lg:grid lg:grid-cols-2">
        <div className="relative min-h-80 bg-amber-100 lg:min-h-full">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-widest text-amber-700 uppercase">
                BrewLite · #{String(product.id).padStart(3, '0')}
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-amber-950 sm:text-4xl">
                {product.name}
              </h1>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-600/20">
              {product.stock > 0 ? `Còn hàng (${product.stock})` : 'Tạm hết hàng'}
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-stone-600">
            Chọn kích cỡ và topping yêu thích. Giá thức uống sẽ được cập nhật ngay theo
            lựa chọn của bạn.
          </p>

          <ProductOptions basePrice={product.price} />
        </div>
      </article>
    </main>
  );
}
