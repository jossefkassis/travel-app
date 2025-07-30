import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsArray,
  ArrayUnique,
  IsISO31661Alpha2,
  Length,
  IsDateString,
  Max,
  Min,
  IsEnum,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types'; // Or '@nestjs/swagger' for OpenAPI generation
// import { PartialType } from '@nestjs/swagger'; // If you're using Swagger for DTO inheritance

import { CreateCountryDto } from './create-country.dto';

// PartialType makes all properties of CreateCountryDto optional
export class UpdateCountryDto extends PartialType(CreateCountryDto) {
  // No need to redeclare properties unless you need to change their validation rules
  // For example, if 'code' couldn't be updated, you'd remove it or override.
  // For images, they are already optional in CreateCountryDto via IsOptional.
}
