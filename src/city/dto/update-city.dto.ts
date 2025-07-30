import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { LatLon } from 'src/interfaces/location.dto';

export class UpdateCityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  countryId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  avgMealPrice?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  location?: LatLon;

  @IsOptional()
  @IsNumber()
  radius?: number;

  @IsOptional()
  @IsNumber()
  mainImageId?: number;

  @IsOptional()
  @IsNumber({}, { each: true })
  galleryImageIds?: number[];

  @IsOptional()
  @IsNumber()
  mealPricePerPerson?: number;

  @IsOptional()
  @IsNumber()
  transportRatePerKm?: number;
}
