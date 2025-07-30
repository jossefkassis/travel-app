import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateCountryDto {
  @ApiProperty({
    example: 'US',
    description: 'ISO-3166-1 country code (2 letters)',
  })
  @IsNotEmpty()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'Code must be 2 uppercase letters' })
  code: string;

  @ApiProperty({ example: 'United States', description: 'Full country name' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 90)
  name: string;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (3 letters)',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be 3 uppercase letters' })
  currency?: string = 'USD';

  @ApiProperty({
    example: 'America/New_York',
    description: 'Standard timezone string',
  })
  @IsNotEmpty()
  @IsString()
  @Length(3, 50)
  timezone: string;

  @ApiProperty({
    example: 'A country in North America...',
    description: 'Detailed description of the country',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Is the country active?',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  is_active?: boolean = true;

  @ApiProperty({
    example: 123,
    description: 'ID of the main image file object',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mainImageId?: number;

  @ApiProperty({
    type: [Number],
    example: [456, 789],
    description: 'Array of IDs of gallery image file objects',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  galleryImageIds?: number[];
}
