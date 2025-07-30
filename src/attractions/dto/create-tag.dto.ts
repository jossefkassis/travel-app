import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({
    description: 'Name of the tag',
    example: 'Adventure',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Description of the tag',
    example: 'Activities involving excitement and risk',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
} 