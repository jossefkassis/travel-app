import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreatePoiTypeDto {
  @ApiProperty({
    description: 'Name of the POI type',
    example: 'Museum',
    maxLength: 80,
  })
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiProperty({
    description: 'Description of the POI type',
    example: 'A place where historical artifacts and artworks are displayed',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
} 