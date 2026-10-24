import { IsEmail, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'Tên người dùng phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên người dùng không được để trống.' })
  @Matches(/^\p{Lu}+(?:\s+\p{Lu}+)*$/u, {
    message: 'Tên người dùng phải viết HOA toàn bộ, chỉ gồm chữ cái và khoảng trắng, không chứa số hay ký tự đặc biệt.',
  })
  name!: string;

  @IsString({ message: 'Email phải là chuỗi ký tự.' })
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  @IsNotEmpty({ message: 'Email không được để trống.' })
  @Matches(/^[a-zA-Z0-9._%+-]+@gmail\.com$/i, {
    message: 'Email bắt buộc phải có định dạng @gmail.com.',
  })
  email!: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự.' })
  password!: string;
}
