import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

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
