import { IsArray, IsOptional, IsString, Length, IsInt } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateCountryDto } from './create-country.dto';

export class UpdateCountryDto extends PartialType(CreateCountryDto) {
  @IsOptional()
  @IsString()
  @Length(2, 2)
  code: string;

  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  is_active?: boolean;

  // Make sure these are 'number' and validated as 'IsInt'
  @IsOptional()
  @IsInt() // <--- THIS IS THE CRUCIAL CHANGE
  mainImageId?: number; // <--- This should be 'number'

  @IsOptional()
  @IsArray()
  @IsInt({ each: true }) // <--- THIS IS THE CRUCIAL CHANGE
  galleryImageIds?: number[]; // <--- This should be 'number[]'
}
