import 'dotenv/config';
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
    imageUrl: 'https://placehold.co/600x400?text=Ca+phe+sua',
    stock: 50,
  },
  {
    name: 'Bạc xỉu',
    price: 32000,
    imageUrl: 'https://placehold.co/600x400?text=Bac+xiu',
    stock: 40,
  },
  {
    name: 'Trà đào',
    price: 35000,
    imageUrl: 'https://placehold.co/600x400?text=Tra+dao',
    stock: 35,
  },
  {
    name: 'Matcha latte',
    price: 39000,
    imageUrl: 'https://placehold.co/600x400?text=Matcha+latte',
    stock: 30,
  },
];

async function main() {
  await prisma.product.deleteMany();
  await prisma.product.createMany({ data: products });
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
