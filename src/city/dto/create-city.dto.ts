import { IsArray, IsInt, IsOptional, IsString, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LatLon } from 'src/interfaces/location.dto';

export class CreateCityDto {
  @IsString()
  name: string;
  @IsInt()
  countryId: number;
  @ValidateNested()
  @Type(() => LatLon)
  location: LatLon;
  @IsOptional()
  is_active?: boolean;
  @IsOptional()
  avgRating?: number; // Will be defaulted by DB
  @IsOptional()
  ratingCount?: number; // Will be defaulted by DB
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  avgMealPrice?: number;

  @IsOptional()
  @IsNumber()
  radius?: number;

  @IsOptional()
  @IsNumber()
  mealPricePerPerson?: number;

  @IsOptional()
  @IsNumber()
  transportRatePerKm?: number;

  // Make sure these are 'number' and validated as 'IsInt'
  @IsOptional()
  @IsInt() // <--- THIS IS THE CRUCIAL CHANGE
  mainImageId?: number; // <--- This should be 'number'

  @IsOptional()
  @IsArray()
  @IsInt({ each: true }) // <--- THIS IS THE CRUCIAL CHANGE
  galleryImageIds?: number[]; // <--- This should be 'number[]'
}
