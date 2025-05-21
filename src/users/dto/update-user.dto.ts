// src/users/dto/update-user.dto.ts
import { IsOptional, IsString, IsPhoneNumber } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string;
}
