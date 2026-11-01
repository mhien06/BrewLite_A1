export type Ingredient = {
  id: number;
  name: string;
  code: string;
  unit: string;
  stock: number;
  version: number;
};
export type Recipe = {
  id: number;
  name: string;
  recipes: {
    amountS: number;
    amountM: number;
    amountL: number;
    isRequired: boolean;
    ingredient: Ingredient;
  }[];
};
export type Topping = {
  id: number;
  toppingCode: string;
  amount: number;
  ingredient: Ingredient;
};
export type Order = {
  id: number;
  status: string;
  total: number;
  user: { name: string };
  items: {
    id: number;
    size: string;
    quantity: number;
    toppings: string[];
    product: { name: string };
  }[];
};
export type Customer = {
  id: number;
  name: string;
  email: string;
  loyaltyPoints: number;
  loyaltyTransactions: { orderId: number; points: number; createdAt: string }[];
};
export type Movement = {
  id: number;
  delta: number;
  before: number;
  after: number;
  reason: string;
  createdAt: string;
  ingredient: { name: string; unit: string };
  actor: { name: string };
};
