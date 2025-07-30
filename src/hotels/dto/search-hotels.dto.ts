import { IsString, IsDateString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class SearchHotelsDto {
  @IsString()
  city: string; // City name or slug

  @IsDateString()
  checkInDate: string;

  @IsDateString()
  checkOutDate: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  guests?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  stars?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;
} 