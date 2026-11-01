"use client";

import { useState, type FormEvent } from "react";
import type { Ingredient } from "@/types/staff";

type Props = {
    ingredients: Ingredient[];
    selected: Ingredient | null;
    busy: boolean;
    loading: boolean;
    onSelect: (ingredient: Ingredient | null) => void;
    onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export default function IngredientsPanel({
    ingredients,
    selected,
    busy,
    loading,
    onSelect,
    onSave,
}: Props) {
    const [search, setSearch] = useState("");
    const [mode, setMode] = useState<"add" | "remove">("add");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");

    // Tìm trong danh sách nguyên liệu đã tải về.
    const keyword = search.trim().toLocaleLowerCase("vi-VN");

    const filteredIngredients = ingredients.filter((ingredient) =>
        `${ingredient.name} ${ingredient.code}`
            .toLocaleLowerCase("vi-VN")
            .includes(keyword),
    );

    // Người dùng luôn nhập số dương.
    // Khi gửi API, hao hụt được đổi thành số âm.
    const quantity = Number(amount);
    const delta = mode === "add" ? quantity : -quantity;
    const stockAfter = selected ? selected.stock + delta : 0;

    const invalidAmount =
        !Number.isInteger(quantity) ||
        quantity <= 0 ||
        quantity > 1000000;

    const cannotSave =
        busy ||
        loading ||
        invalidAmount ||
        stockAfter < 0 ||
        reason.trim().length < 3;

    function openForm(ingredient: Ingredient, action: "add" | "remove") {
        setMode(action);
        setAmount("");
        setReason("");
        onSelect(ingredient);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!selected || cannotSave) return;

        // Hàm ở page.tsx phụ trách gửi API và tải lại dữ liệu.
        await onSave(event);
    }

    const inputClass =
        "mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-100";

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-stone-500">
                    Theo dõi và cập nhật nguyên liệu trong kho.
                </p>

                <label className="w-full sm:w-72">
                    <span className="sr-only">Tìm nguyên liệu</span>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Tìm tên hoặc mã nguyên liệu..."
                        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-amber-700"
                    />
                </label>
            </div>

            {/* Biểu mẫu nằm trước bảng để dễ nhìn thấy khi mở */}
            {selected && (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-2xl border border-amber-200 bg-white p-5"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-stone-900">
                                {mode === "add" ? "Nhập thêm" : "Ghi nhận hao hụt"}
                            </h3>
                            <p className="mt-1 text-sm text-stone-500">
                                {selected.name}
                            </p>
                        </div>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onSelect(null)}
                            className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-50"
                        >
                            Đóng
                        </button>
                    </div>

                    {/* Giữ tên delta để tương thích hàm adjust hiện tại */}
                    <input type="hidden" name="delta" value={delta} />

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium">
                            Số lượng ({selected.unit})
                            <input
                                type="number"
                                min="1"
                                max="1000000"
                                step="1"
                                required
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                placeholder="Nhập số lượng"
                                className={inputClass}
                            />
                        </label>

                        <label className="text-sm font-medium">
                            Lý do
                            <input
                                name="reason"
                                required
                                minLength={3}
                                maxLength={200}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder={
                                    mode === "add"
                                        ? "Ví dụ: Nhập nguyên liệu đầu ngày"
                                        : "Ví dụ: Nguyên liệu bị hỏng"
                                }
                                className={inputClass}
                            />
                        </label>
                    </div>

                    <div className="mt-5 rounded-xl bg-stone-50 p-4 text-sm">
                        <p className="text-stone-500">
                            Tồn hiện tại:{" "}
                            <strong className="text-stone-800">
                                {selected.stock.toLocaleString("vi-VN")} {selected.unit}
                            </strong>
                        </p>

                        {!invalidAmount && (
                            <p
                                aria-live="polite"
                                className={`mt-2 ${stockAfter < 0 ? "text-red-700" : "text-stone-700"
                                    }`}
                            >
                                Sau thay đổi:{" "}
                                <strong>
                                    {stockAfter.toLocaleString("vi-VN")} {selected.unit}
                                </strong>
                            </p>
                        )}

                        {stockAfter < 0 && (
                            <p role="alert" className="mt-2 text-red-700">
                                Lượng hao hụt không được vượt tồn kho.
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={cannotSave}
                        className="mt-5 rounded-xl bg-amber-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? "Đang lưu..." : "Xác nhận"}
                    </button>
                </form>
            )}

            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-stone-200 bg-stone-50 text-stone-500">
                        <tr>
                            <th className="px-5 py-4 font-medium">Nguyên liệu</th>
                            <th className="px-5 py-4 text-right font-medium">Tồn kho</th>
                            <th className="px-5 py-4 font-medium">Đơn vị</th>
                            <th className="px-5 py-4 text-right font-medium">Thao tác</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-stone-100">
                        {filteredIngredients.map((ingredient) => (
                            <tr key={ingredient.id} className="hover:bg-amber-50/40">
                                <td className="px-5 py-4">
                                    <p className="font-semibold">{ingredient.name}</p>
                                    <p className="mt-1 text-xs text-stone-400">
                                        {ingredient.code}
                                    </p>
                                </td>

                                <td className="px-5 py-4 text-right font-semibold tabular-nums">
                                    {ingredient.stock.toLocaleString("vi-VN")}
                                </td>

                                <td className="px-5 py-4 text-stone-500">
                                    {ingredient.unit}
                                </td>

                                <td className="px-5 py-4">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={busy || loading}
                                            onClick={() => openForm(ingredient, "add")}
                                            className="whitespace-nowrap rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                        >
                                            Nhập thêm
                                        </button>

                                        <button
                                            type="button"
                                            disabled={busy || loading}
                                            onClick={() => openForm(ingredient, "remove")}
                                            className="whitespace-nowrap rounded-lg border border-stone-200 px-3 py-2 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                                        >
                                            Hao hụt
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {filteredIngredients.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-stone-500">
                                    Không tìm thấy nguyên liệu.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}