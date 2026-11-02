const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
).replace(/\/$/, "");

// Dùng chung cho mọi API nhân viên: gắn JWT và đọc thông báo lỗi.
export async function staffRequest(
  token: string,
  path: string,
  method = "GET",
  body?: object,
) {
  const response = await fetch(`${API_URL}/staff/${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "Không tải được dữ liệu.",
    );
  return data;
}

export async function loadStaffData(token: string) {
  const [ingredients, recipes, toppings, orders, customers, movements] =
    await Promise.all([
      staffRequest(token, "ingredients"),
      staffRequest(token, "recipes"),
      staffRequest(token, "topping-recipes"),
      staffRequest(token, "orders"),
      staffRequest(token, "loyalty"),
      staffRequest(token, "movements"),
    ]);
  return { ingredients, recipes, toppings, orders, customers, movements };
}
