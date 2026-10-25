export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me-to-a-long-random-string') {
    throw new Error(
      'JWT_SECRET must be set to a private value before starting the application.',
    );
  }
  return secret;
}
