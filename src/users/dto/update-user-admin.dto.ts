import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateUserAdminDto } from './create-user-admin.dto';
import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

// Inherits all properties from CreateUserAdminDto and makes them optional
export class UpdateUserAdminDto extends PartialType(CreateUserAdminDto) {
  @ApiProperty({ example: 'Admin User', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'adminuser', description: 'Username' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers and underscores',
  })
  username: string;

  @ApiProperty({ example: 'admin@example.com', description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '0123456789',
    description: 'User phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '1985-10-20',
    description: 'User birth date (YYYY-MM-DD)',
    required: false,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    description:
      'User password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)',
    minLength: 8,
  })
  @ApiProperty({
    example: 1,
    description:
      'Role ID (e.g., 1 for Super Admin, 2 for Customer, 3 for Guide)',
  })
  @IsNumber()
  @IsNotEmpty()
  roleId: number;

  @ApiProperty({
    example: true,
    description: 'Is user active?',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
  @ApiProperty({
    example: 'newpassword!',
    description: 'New password (optional)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/, {
    message:
      'Password too weak - must contain at least 1 uppercase, 1 lowercase, and 1 number',
  })
  password?: string;
}
