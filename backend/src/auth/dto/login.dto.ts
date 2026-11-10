import { IsByteLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'customer@gmail.com' })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @IsByteLength(0, 72, { message: 'Mật khẩu không được vượt quá 72 byte.' })
  @ApiProperty({ format: 'password', maxLength: 72 })
  password!: string;
}
