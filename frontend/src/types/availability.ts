export type ToppingAvailability = {
  code: string;
  label: string;
  stockQuantity: number;
  maxQuantity: number;
};
export type CartLineAvailability = {
  index: number;
  productId: number;
  size: string;
  quantity: number;
  maxQuantity: number;
  mainMaxQuantity: number;
  message: string | null;
  toppings: ToppingAvailability[];
};
export type CartAvailability = {
  available: boolean;
  items: CartLineAvailability[];
};

export type StockRequestItem = {
  productId: number;
  size: string;
  quantity: number;
  toppings: string[];
};
