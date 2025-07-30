import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsISO8601 } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    example: 'Jane Doe',
    description: 'User full name',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: '0123456789',
    description: 'User phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '1990-01-15',
    description: 'User birth date (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string; // Consider Date type if you handle conversion in service
}
