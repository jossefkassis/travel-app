// src/auth/dto/register.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers and underscores',
  })
  username: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description:
      'User password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/, {
    message:
      'Password too weak - must contain at least 1 uppercase, 1 lowercase, and 1 number',
  })
  password: string;
}
