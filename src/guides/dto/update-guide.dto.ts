import { IsNumber, IsString, IsOptional, IsISO8601 } from 'class-validator';

export class UpdateGuideDto {
  // User-specific fields
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsISO8601({ strict: true })
  @IsOptional()
  birthDate?: string;

  // Guide-specific fields
  @IsNumber()
  @IsOptional()
  pricePerDay?: number;

  @IsNumber()
  @IsOptional()
  cityId?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
