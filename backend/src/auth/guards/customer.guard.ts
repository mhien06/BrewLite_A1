import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // JwtAuthGuard chạy trước. JwtStrategy đã đọc tài khoản từ database.
    const request = context
      .switchToHttp()
      .getRequest<{ user: { role?: string } }>();
    if (request.user.role === 'STAFF') {
      throw new ForbiddenException(
        'Tài khoản nhân viên không được mua hàng. Vui lòng dùng tài khoản khách hàng riêng.',
      );
    }
    return true;
  }
}
