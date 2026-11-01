import { defineConfig } from 'vitest/config';

// Chỉ chạy khi chủ động truyền URL của database kiểm thử riêng.
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
) {
  throw new Error(
    'Đặt TEST_DATABASE_URL trỏ tới database riêng có tên kết thúc bằng _test.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['test/*.database-test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
