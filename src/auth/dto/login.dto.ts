// src/auth/dto/login.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  emailOrUsername: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
