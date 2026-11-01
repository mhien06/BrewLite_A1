"use client";

import { formatToppingLabels } from "@/utils/toppings";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

import IngredientsPanel from "@/components/staff/IngredientsPanel";
import { useAuthStore } from "@/stores/auth.store";
import { loadStaffData, staffRequest } from "@/services/staff.service";

import type {
  Ingredient,
  Recipe,
  Topping,
  Order,
  Customer,
  Movement,
} from "@/types/staff";

// Dữ liệu dùng trong trang nhân viên.
type StaffData = {
  ingredients: Ingredient[];
  recipes: Recipe[];
  toppings: Topping[];
  orders: Order[];
  customers: Customer[];
  movements: Movement[];
};

const tabs = [
  "Nguyên liệu",
  "Công thức",
  "Đơn hàng",
  "Điểm thưởng",
  "Lịch sử kho",
];

const statusLabels: Record<string, string> = {
  CANCELLED: "Đã hủy",
  PAID: "Chờ pha chế",
  PREPARING: "Đang pha",
  READY: "Chờ nhận",
  COMPLETED: "Hoàn tất",
};

// Trạng thái tiếp theo khi nhân viên bấm nút.
const nextStatus: Record<string, { status: string; label: string }> = {
  PAID: {
    status: "PREPARING",
    label: "Nhận pha chế",
  },
  PREPARING: {
    status: "READY",
    label: "Đã pha xong",
  },
  READY: {
    status: "COMPLETED",
    label: "Đã giao khách",
  },
};

const toppingNames: Record<string, string> = {
  pearls: "Trân châu",
  cream: "Kem sữa",
  jelly: "Thạch cà phê",
};

const buttonClass =
  "rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50";

const cardClass =
  "rounded-2xl border border-stone-200 bg-white p-5";

// Tính số phần có thể pha riêng cho một món và một size.
function getAvailableUnits(
  product: Recipe,
  size: "amountS" | "amountM" | "amountL",
) {
  const requiredRecipes = product.recipes.filter(
    (recipe) => recipe.isRequired,
  );

  if (requiredRecipes.length === 0) return 0;

  const availableUnits = requiredRecipes.map((recipe) => {
    const amount = recipe[size];

    if (amount <= 0) return 0;

    return Math.floor(recipe.ingredient.stock / amount);
  });

  return Math.min(...availableUnits);
}

export default function StaffPage() {
  const token = useAuthStore((state) => state.token);
  const initializing = useAuthStore((state) => state.isLoading);

  // Mặc định mở Đơn hàng.
  const [tab, setTab] = useState(2);

  const [data, setData] = useState<StaffData>({
    ingredients: [],
    recipes: [],
    toppings: [],
    orders: [],
    customers: [],
    movements: [],
  });

  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Tải dữ liệu khi đăng nhập hoặc đổi tài khoản.
  useEffect(() => {
    if (!token) return;

    const currentToken = token;
    let active = true;

    async function load() {
      setLoading(true);
      setAllowed(false);
      setError("");
      setNotice("");

      try {
        const result = await loadStaffData(currentToken);

        // Không cập nhật trang nếu đã đổi tài khoản hoặc rời trang.
        if (!active) return;

        setData(result);
        setAllowed(true);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Không kết nối được máy chủ.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [token]);

  // Tải lại sau khi chỉnh kho hoặc cập nhật đơn.
  async function refresh(): Promise<boolean> {
    if (!token) return false;

    setLoading(true);
    setError("");

    try {
      const result = await loadStaffData(token);

      // Bỏ kết quả nếu phiên đăng nhập đã đổi.
      if (useAuthStore.getState().token !== token) return false;

      setData(result);
      setAllowed(true);
      return true;
    } catch (err) {
      if (useAuthStore.getState().token !== token) return false;

      setAllowed(false);
      setError(
        err instanceof Error ? err.message : "Không tải được dữ liệu.",
      );
      return false;
    } finally {
      if (useAuthStore.getState().token === token) {
        setLoading(false);
      }
    }
  }

  // IngredientsPanel gửi biểu mẫu về hàm này để lưu kho.
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !selected || busy) return;

    const form = new FormData(event.currentTarget);

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await staffRequest(
        token,
        `ingredients/${selected.id}`,
        "PATCH",
        {
          delta: Number(form.get("delta")),
          version: selected.version,
          reason: String(form.get("reason") || "").trim(),
        },
      );

      setSelected(null);

      const refreshed = await refresh();

      if (refreshed) {
        setNotice("Đã cập nhật nguyên liệu và lưu lịch sử kho.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không cập nhật được kho.",
      );
    } finally {
      setBusy(false);
    }
  }

  // Chuyển đơn sang bước pha chế tiếp theo.
  async function advance(order: Order, cancel = false) {
    const next = cancel ? { status: "CANCELLED", label: "Hủy đơn" } : nextStatus[order.status];

    if (!token || !next || busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await staffRequest(token, `orders/${order.id}/status`, "PATCH", {
        status: next.status,
      });

      const refreshed = await refresh();

      if (refreshed) {
        setNotice(`Đã cập nhật đơn #${order.id}.`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không cập nhật được đơn hàng.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeTab(index: number) {
    setTab(index);
    setSelected(null);
    setNotice("");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 text-stone-800 lg:px-6">
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Menu bên trái */}
        <aside className="rounded-2xl border border-stone-200 bg-white p-3 lg:sticky lg:top-6">
          <div className="hidden border-b border-stone-100 px-3 pb-4 pt-2 lg:block">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
              BrewLite
            </p>
            <h1 className="mt-1 text-lg font-bold">Quản lý quầy</h1>
          </div>

          <nav
            aria-label="Chức năng nhân viên"
            className="flex gap-2 overflow-x-auto lg:mt-3 lg:flex-col"
          >
            {tabs.map((label, index) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                aria-pressed={tab === index}
                onClick={() => changeTab(index)}
                className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm font-medium transition disabled:opacity-50 ${tab === index
                  ? "bg-amber-800 text-white"
                  : "text-stone-600 hover:bg-stone-100"
                  }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Nội dung bên phải */}
        <section className="min-w-0">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-500">
                Khu vực nhân viên
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                {tabs[tab]}
              </h2>
            </div>

            {token && (
              <button
                type="button"
                disabled={loading || busy || initializing}
                onClick={() => {
                  setNotice("");
                  void refresh();
                }}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50"
              >
                {loading ? "Đang tải..." : "Làm mới"}
              </button>
            )}
          </header>

          {(loading || initializing) && (
            <p role="status" className="mb-4 text-sm text-stone-500">
              Đang tải dữ liệu...
            </p>
          )}

          {!token && !initializing && (
            <div className={cardClass}>
              Vui lòng{" "}
              <Link
                href="/login"
                className="font-semibold text-amber-800 underline"
              >
                đăng nhập bằng tài khoản nhân viên
              </Link>
              .
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            >
              {notice}
            </p>
          )}

          {allowed && token && (
            <>
              {/* Nguyên liệu: dùng component riêng */}
              {tab === 0 && (
                <IngredientsPanel
                  ingredients={data.ingredients}
                  selected={selected}
                  busy={busy}
                  loading={loading}
                  onSelect={setSelected}
                  onSave={adjust}
                />
              )}

              {/* Công thức */}
              {tab === 1 && (
                <div className="space-y-5">
                  <p className="text-sm text-stone-500">
                    Định lượng cho một ly. Số phần có thể pha chưa bao
                    gồm topping; các món có thể dùng chung nguyên liệu.
                  </p>

                  {data.recipes.length === 0 && (
                    <p className={cardClass}>Chưa có công thức.</p>
                  )}

                  {data.recipes.map((product) => (
                    <article
                      key={product.id}
                      className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                    >
                      <div className="border-b border-stone-100 p-5">
                        <h3 className="font-bold">{product.name}</h3>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(["amountS", "amountM", "amountL"] as const).map(
                            (size, index) => (
                              <span
                                key={size}
                                className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-600"
                              >
                                Size {["S", "M", "L"][index]}:{" "}
                                {getAvailableUnits(product, size)} phần
                              </span>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-stone-50 text-stone-500">
                            <tr>
                              <th className="px-5 py-3 font-medium">
                                Nguyên liệu
                              </th>
                              <th className="px-5 py-3 font-medium">S</th>
                              <th className="px-5 py-3 font-medium">M</th>
                              <th className="px-5 py-3 font-medium">L</th>
                              <th className="px-5 py-3 font-medium">
                                Đơn vị
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-stone-100">
                            {product.recipes.map((recipe) => (
                              <tr key={recipe.ingredient.id}>
                                <td className="px-5 py-3">
                                  {recipe.ingredient.name}
                                  {!recipe.isRequired && (
                                    <span className="ml-2 text-xs text-stone-400">
                                      Không bắt buộc
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3">
                                  {recipe.amountS}
                                </td>
                                <td className="px-5 py-3">
                                  {recipe.amountM}
                                </td>
                                <td className="px-5 py-3">
                                  {recipe.amountL}
                                </td>
                                <td className="px-5 py-3 text-stone-500">
                                  {recipe.ingredient.unit}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}

                  <article className={cardClass}>
                    <h3 className="font-bold">Topping chuẩn bị sẵn</h3>
                    <p className="mb-4 mt-1 text-sm text-stone-500">
                      Định lượng cho mỗi ly có chọn topping.
                    </p>

                    {data.toppings.length === 0 && (
                      <p className="text-sm text-stone-500">
                        Chưa có công thức topping.
                      </p>
                    )}

                    <div className="divide-y divide-stone-100">
                      {data.toppings.map((topping) => (
                        <div
                          key={topping.id}
                          className="flex justify-between gap-4 py-3 text-sm"
                        >
                          <span>{topping.ingredient.name}</span>
                          <span className="whitespace-nowrap font-semibold">
                            {topping.amount}{" "}
                            {topping.ingredient.unit}/phần
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              )}

              {/* Đơn hàng */}
              {tab === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-stone-500">
                    Tiếp nhận và xử lý các đơn đã thanh toán.
                  </p>

                  {data.orders.length === 0 && (
                    <div className={`${cardClass} text-center text-stone-500`}>
                      Chưa có đơn đã thanh toán.
                    </div>
                  )}

                  {data.orders.map((order) => (
                    <article key={order.id} className={cardClass}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold">Đơn #{order.id}</h3>
                          <p className="mt-1 text-sm text-stone-500">
                            {order.user.name}
                          </p>
                        </div>

                        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                          {statusLabels[order.status] || order.status}
                        </span>
                      </div>

                      <div className="my-4 space-y-3 border-y border-stone-100 py-4">
                        {order.items.map((item) => (
                          <div key={item.id} className="text-sm">
                            <p className="font-medium">
                              {item.quantity} × {item.product.name}
                              <span className="ml-2 font-normal text-stone-500">
                                Size {item.size}
                              </span>
                            </p>

                            {item.toppings.length > 0 && (
                              <p className="mt-1 text-xs text-stone-500">
                                Topping:{" "}
                                {formatToppingLabels(item.toppings.map((code) => toppingNames[code] || code))}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-bold">
                          {order.total.toLocaleString("vi-VN")} đ
                        </p>

                        {order.status === "PAID" && <button type="button" disabled={busy || loading} onClick={() => { if (window.confirm("Hủy đơn và hoàn kho? Thao tác này chưa thực hiện hoàn tiền.")) void advance(order, true); }} className="rounded-full border border-red-200 px-5 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">Hủy đơn</button>}
                        {nextStatus[order.status] && (
                          <button
                            type="button"
                            disabled={busy || loading}
                            onClick={() => advance(order)}
                            className={buttonClass}
                          >
                            {busy
                              ? "Đang xử lý..."
                              : nextStatus[order.status].label}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Điểm thưởng: chỉ xem */}
              {tab === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-stone-500">
                    Chọn khách hàng để xem lịch sử cộng điểm.
                  </p>

                  {data.customers.length === 0 && (
                    <p className={cardClass}>
                      Chưa có dữ liệu khách hàng.
                    </p>
                  )}

                  {data.customers.map((customer) => (
                    <details
                      key={customer.id}
                      className="rounded-2xl border border-stone-200 bg-white"
                    >
                      <summary className="cursor-pointer p-5">
                        <span className="font-semibold">
                          {customer.name}
                        </span>
                        <span className="ml-3 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
                          {customer.loyaltyPoints} điểm
                        </span>
                        <span className="mt-2 block text-sm text-stone-500">
                          {customer.email}
                        </span>
                      </summary>

                      <div className="border-t border-stone-100 px-5 pb-4">
                        {customer.loyaltyTransactions.length === 0 && (
                          <p className="py-4 text-sm text-stone-500">
                            Chưa có lịch sử cộng điểm.
                          </p>
                        )}

                        {customer.loyaltyTransactions.map((transaction) => (
                          <div
                            key={transaction.orderId}
                            className="flex flex-wrap justify-between gap-2 border-b border-stone-100 py-3 text-sm last:border-0"
                          >
                            <div>
                              <p>Đơn #{transaction.orderId}</p>
                              <p className="mt-1 text-xs text-stone-500">
                                {new Date(
                                  transaction.createdAt,
                                ).toLocaleString("vi-VN")}
                              </p>
                            </div>

                            <span className="font-semibold text-green-700">
                              {transaction.reversed ? `Đã thu hồi ${transaction.points} điểm` : `+${transaction.points} điểm`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Lịch sử điều chỉnh kho */}
              {tab === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-stone-500">
                    Các lần nhập thêm và ghi nhận hao hụt của nhân viên.
                  </p>

                  <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-stone-500">
                        <tr>
                          <th className="px-5 py-4 font-medium">
                            Nguyên liệu
                          </th>
                          <th className="px-5 py-4 font-medium">
                            Thay đổi
                          </th>
                          <th className="px-5 py-4 font-medium">
                            Trước → Sau
                          </th>
                          <th className="px-5 py-4 font-medium">
                            Lý do
                          </th>
                          <th className="px-5 py-4 font-medium">
                            Người thực hiện
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-stone-100">
                        {data.movements.map((movement) => (
                          <tr key={movement.id}>
                            <td className="px-5 py-4 font-medium">
                              {movement.ingredient.name}
                            </td>

                            <td
                              className={`whitespace-nowrap px-5 py-4 font-semibold ${movement.delta > 0
                                ? "text-green-700"
                                : "text-red-700"
                                }`}
                            >
                              {movement.delta > 0 ? "+" : ""}
                              {movement.delta.toLocaleString("vi-VN")}{" "}
                              {movement.ingredient.unit}
                            </td>

                            <td className="whitespace-nowrap px-5 py-4">
                              {movement.before.toLocaleString("vi-VN")} →{" "}
                              {movement.after.toLocaleString("vi-VN")}
                            </td>

                            <td className="px-5 py-4 text-stone-600">
                              {movement.reason}
                            </td>

                            <td className="px-5 py-4">
                              <p>{movement.actor.name}</p>
                              <p className="mt-1 whitespace-nowrap text-xs text-stone-400">
                                {new Date(
                                  movement.createdAt,
                                ).toLocaleString("vi-VN")}
                              </p>
                            </td>
                          </tr>
                        ))}

                        {data.movements.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-8 text-center text-stone-500"
                            >
                              Chưa có điều chỉnh kho.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}