import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PromotionType } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const products = [
  {
    name: 'Cà phê sữa',
    price: 29000,
    imageUrl: '/products/ca-phe-sua.jpg',
    stock: 50,
  },
  {
    name: 'Bạc xỉu',
    price: 32000,
    imageUrl: '/products/bac-xiu.jpg',
    stock: 40,
  },
  {
    name: 'Trà đào',
    price: 35000,
    imageUrl: '/products/tra-dao.jpg',
    stock: 35,
  },
  {
    name: 'Matcha latte',
    price: 39000,
    imageUrl: '/products/matcha-latte.jpg',
    stock: 30,
  },
];

const defaultIngredients = [
  { code: 'COFFEE_BEAN', name: 'Hạt cà phê', unit: 'g', stock: 1000 },
  { code: 'CONDENSED_MILK', name: 'Sữa đặc', unit: 'ml', stock: 2000 },
  { code: 'FRESH_MILK', name: 'Sữa tươi', unit: 'ml', stock: 3000 },
  { code: 'PEACH_TEA_BASE', name: 'Cốt trà đào', unit: 'ml', stock: 7000 },
  { code: 'PEACH_SLICE', name: 'Đào miếng', unit: 'miếng', stock: 105 },
  { code: 'MATCHA_POWDER', name: 'Bột Matcha', unit: 'g', stock: 300 },
  { code: 'PEARLS', name: 'Trân châu đường đen', unit: 'g', stock: 1500 },
  { code: 'CREAM_FOAM', name: 'Kem sữa macchiato', unit: 'ml', stock: 1600 },
  { code: 'COFFEE_JELLY', name: 'Thạch cà phê', unit: 'g', stock: 1400 },
];

const defaultProductRecipes: Array<{
  productName: string;
  ingredientCode: string;
  amountS: number;
  amountM: number;
  amountL: number;
}> = [
  {
    productName: 'Cà phê sữa',
    ingredientCode: 'COFFEE_BEAN',
    amountS: 20,
    amountM: 25,
    amountL: 30,
  },
  {
    productName: 'Cà phê sữa',
    ingredientCode: 'CONDENSED_MILK',
    amountS: 30,
    amountM: 40,
    amountL: 50,
  },
  {
    productName: 'Bạc xỉu',
    ingredientCode: 'COFFEE_BEAN',
    amountS: 15,
    amountM: 20,
    amountL: 25,
  },
  {
    productName: 'Bạc xỉu',
    ingredientCode: 'CONDENSED_MILK',
    amountS: 40,
    amountM: 50,
    amountL: 60,
  },
  {
    productName: 'Bạc xỉu',
    ingredientCode: 'FRESH_MILK',
    amountS: 75,
    amountM: 95,
    amountL: 115,
  },
  {
    productName: 'Trà đào',
    ingredientCode: 'PEACH_TEA_BASE',
    amountS: 150,
    amountM: 200,
    amountL: 250,
  },
  {
    productName: 'Trà đào',
    ingredientCode: 'PEACH_SLICE',
    amountS: 3,
    amountM: 4,
    amountL: 5,
  },
  {
    productName: 'Matcha latte',
    ingredientCode: 'MATCHA_POWDER',
    amountS: 10,
    amountM: 15,
    amountL: 20,
  },
  {
    productName: 'Matcha latte',
    ingredientCode: 'FRESH_MILK',
    amountS: 100,
    amountM: 130,
    amountL: 160,
  },
  {
    productName: 'Matcha latte',
    ingredientCode: 'CONDENSED_MILK',
    amountS: 20,
    amountM: 25,
    amountL: 30,
  },
];

const defaultToppingRecipes = [
  { toppingCode: 'pearls', ingredientCode: 'PEARLS', amount: 30 },
  { toppingCode: 'cream', ingredientCode: 'CREAM_FOAM', amount: 40 },
  { toppingCode: 'jelly', ingredientCode: 'COFFEE_JELLY', amount: 35 },
];

async function main() {
  for (const product of products) {
    const existing = await prisma.product.findFirst({
      where: { name: product.name },
    });

    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { imageUrl: product.imageUrl },
      });
    } else {
      await prisma.product.create({
        data: product,
      });
    }
  }

  for (const ingredient of defaultIngredients) {
    await prisma.ingredient.upsert({
      where: { code: ingredient.code },
      update: {
        name: ingredient.name,
        unit: ingredient.unit,
      },
      create: ingredient,
    });
  }

  const allProducts = await prisma.product.findMany();
  const productByName = new Map(allProducts.map((p) => [p.name, p]));
  const allIngredients = await prisma.ingredient.findMany();
  const ingredientByCode = new Map(allIngredients.map((i) => [i.code, i]));

  for (const recipe of defaultProductRecipes) {
    const product = productByName.get(recipe.productName);
    const ingredient = ingredientByCode.get(recipe.ingredientCode);
    if (!product || !ingredient) continue;

    await prisma.productIngredient.upsert({
      where: {
        productId_ingredientId: {
          productId: product.id,
          ingredientId: ingredient.id,
        },
      },
      update: {
        amountS: recipe.amountS,
        amountM: recipe.amountM,
        amountL: recipe.amountL,
        isRequired: true,
      },
      create: {
        productId: product.id,
        ingredientId: ingredient.id,
        amountS: recipe.amountS,
        amountM: recipe.amountM,
        amountL: recipe.amountL,
        isRequired: true,
      },
    });
  }

  for (const toppingRecipe of defaultToppingRecipes) {
    const ingredient = ingredientByCode.get(toppingRecipe.ingredientCode);
    if (!ingredient) continue;

    await prisma.toppingIngredient.upsert({
      where: {
        toppingCode_ingredientId: {
          toppingCode: toppingRecipe.toppingCode,
          ingredientId: ingredient.id,
        },
      },
      update: {
        amount: toppingRecipe.amount,
        isRequired: true,
      },
      create: {
        toppingCode: toppingRecipe.toppingCode,
        ingredientId: ingredient.id,
        amount: toppingRecipe.amount,
        isRequired: true,
      },
    });
  }

  await prisma.promotion.upsert({
    where: { code: 'BREW10' },
    update: {
      type: PromotionType.PERCENT,
      value: 10,
      minOrderTotal: 50_000,
      maxDiscount: 20_000,
      isActive: true,
    },
    create: {
      code: 'BREW10',
      type: PromotionType.PERCENT,
      value: 10,
      minOrderTotal: 50_000,
      maxDiscount: 20_000,
      isActive: true,
    },
  });

  await prisma.promotion.upsert({
    where: { code: 'GIAM15K' },
    update: {
      type: PromotionType.FIXED_AMOUNT,
      value: 15_000,
      minOrderTotal: 60_000,
      maxDiscount: null,
      isActive: true,
    },
    create: {
      code: 'GIAM15K',
      type: PromotionType.FIXED_AMOUNT,
      value: 15_000,
      minOrderTotal: 60_000,
      isActive: true,
    },
  });

  const demoEmail = 'customer@gmail.com';
  const existingUser = await prisma.user.findUnique({
    where: { email: demoEmail },
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash('password123', 10);
    await prisma.user.create({
      data: {
        email: demoEmail,
        name: 'NGUYEN VAN A',
        passwordHash,
        loyaltyPoints: 100,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
