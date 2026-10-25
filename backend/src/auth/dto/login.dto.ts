import { IsByteLength, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  email!: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  @IsByteLength(0, 72, { message: 'Mật khẩu không được vượt quá 72 byte.' })
  password!: string;
}
