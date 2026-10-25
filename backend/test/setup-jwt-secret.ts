import { randomBytes } from 'node:crypto';

process.env.JWT_SECRET = randomBytes(64).toString('hex');
