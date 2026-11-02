import {
  BadRequestException,
  Injectable,
  ParseIntPipe,
  type ArgumentMetadata,
} from '@nestjs/common';
import { MAX_DATABASE_ID } from '../database-id.js';

@Injectable()
export class ParseDatabaseIdPipe extends ParseIntPipe {
  override async transform(
    value: string,
    metadata: ArgumentMetadata,
  ): Promise<number> {
    const id = await super.transform(value, metadata);
    if (id == null || id < 1 || id > MAX_DATABASE_ID) {
      throw new BadRequestException(
        `ID must be between 1 and ${MAX_DATABASE_ID}.`,
      );
    }
    return id;
  }
}
