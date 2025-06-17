import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { LatLon } from 'src/interfaces/location.dto';

export class CreateCityDto {
  @IsString()
  name: string;
  @IsInt()
  countryId: number;
  location: LatLon;
  @IsOptional()
  is_active?: boolean;
  @IsOptional()
  avgRating?: number; // Will be defaulted by DB
  @IsOptional()
  ratingCount?: number; // Will be defaulted by DB

  // Make sure these are 'number' and validated as 'IsInt'
  @IsOptional()
  @IsInt() // <--- THIS IS THE CRUCIAL CHANGE
  mainImageId?: number; // <--- This should be 'number'

  @IsOptional()
  @IsArray()
  @IsInt({ each: true }) // <--- THIS IS THE CRUCIAL CHANGE
  galleryImageIds?: number[]; // <--- This should be 'number[]'
}
