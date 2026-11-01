import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id: number } }>();
    const user =
      request.user &&
      (await this.prisma.user.findUnique({
        where: { id: request.user.id },
        select: { role: true },
      }));
    // Đọc quyền từ database mỗi lần; không tin quyền do trình duyệt gửi lên.
    if (!user || user.role !== 'STAFF')
      throw new ForbiddenException('Chỉ nhân viên được sử dụng chức năng này.');
    return true;
  }
}
