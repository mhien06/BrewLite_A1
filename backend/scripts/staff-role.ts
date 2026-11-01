import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3];
if (!email || (role !== 'STAFF' && role !== 'CUSTOMER')) {
  throw new Error(
    'Cách dùng: npm run staff:role -- email STAFF (hoặc CUSTOMER để thu hồi quyền).',
  );
}
const prisma = new PrismaService();
try {
  const user = await prisma.user.update({
    where: { email },
    data: { role },
    select: { email: true, role: true },
  });
  console.log(user);
} finally {
  await prisma.$disconnect();
}
