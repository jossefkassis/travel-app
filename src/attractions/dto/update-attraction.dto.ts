import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, IsUrl, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAttractionDto {
  @ApiProperty({
    example: 'Louvre Museum',
    description: 'Name of the attraction',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 1,
    description: 'City ID where the attraction is located',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  cityId?: number;

  @ApiProperty({
    example: 1,
    description: 'POI type ID (e.g., Museum, Restaurant, Park)',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  poiTypeId?: number;

  @ApiProperty({
    example: 'The world\'s largest art museum',
    description: 'Description of the attraction',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 'Rue de Rivoli, 75001 Paris, France',
    description: 'Address of the attraction',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: [2.3522, 48.8566],
    description: 'Location coordinates [longitude, latitude]',
    required: false,
  })
  @IsArray()
  @IsOptional()
  location?: [number, number]; // [longitude, latitude]

  @ApiProperty({
    example: 'https://www.louvre.fr',
    description: 'Website URL',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiProperty({
    example: 17.00,
    description: 'Entry price',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiProperty({
    example: 15.00,
    description: 'Discounted price',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  discountPrice?: number;

  @ApiProperty({
    example: 'info@louvre.fr',
    description: 'Contact email',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiProperty({
    example: '+33 1 40 20 50 50',
    description: 'Contact phone number',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    example: 'Monday: Closed, Tuesday-Sunday: 9:00 AM - 6:00 PM',
    description: 'Opening hours information',
    required: false,
  })
  @IsString()
  @IsOptional()
  openingHours?: string;

  @ApiProperty({
    example: '02:30:00',
    description: 'Average duration of visit (HH:MM:SS)',
    required: false,
  })
  @IsString()
  @IsOptional()
  avgDuration?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the attraction is active',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    example: 1,
    description: 'Main image ID',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  mainImageId?: number;

  @ApiProperty({
    example: [2, 3, 4],
    description: 'Gallery image IDs',
    required: false,
  })
  @IsArray()
  @IsOptional()
  galleryImageIds?: number[];

  @ApiProperty({
    example: [1, 2, 3],
    description: 'Tag IDs to associate with this attraction',
    required: false,
  })
  @IsArray()
  @IsOptional()
  tagIds?: number[];
} 