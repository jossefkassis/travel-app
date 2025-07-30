import { IsNumber, IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class CreateGuideFlatDto {
  // User fields
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // Guide fields
  @IsNumber()
  pricePerDay: number;

  @IsNumber()
  cityId: number;

  @IsString()
  @IsNotEmpty()
  description: string;
} 