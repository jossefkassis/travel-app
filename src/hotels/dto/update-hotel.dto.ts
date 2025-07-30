import { IsString, IsNumber, IsOptional, IsEmail, Min, Max, IsArray } from 'class-validator';
import { LatLon } from '../../interfaces/location.dto';

export class UpdateHotelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  cityId?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  stars?: number;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsOptional()
  location?: LatLon;

  @IsString()
  @IsOptional()
  checkInTime?: string;

  @IsString()
  @IsOptional()
  checkOutTime?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  mainImageId?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  galleryImageIds?: number[];
} 