export type CartSizeId = 'S' | 'M' | 'L';

export interface CartSize {
  id: CartSizeId;
  label: string;
  extra: number;
}

export interface CartTopping {
  id: string;
  label: string;
  price: number;
}

export interface AddCartItemInput {
  productId: number;
  name: string;
  imageUrl: string;
  stock: number;
  size: CartSize;
  toppings: CartTopping[];
  unitPrice: number;
}

export interface CartItem extends AddCartItemInput {
  key: string;
  quantity: number;
}