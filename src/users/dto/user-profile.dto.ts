import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class UserProfileDto {
  @Expose()
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'The unique identifier of the user',
  })
  id: string;

  @Expose()
  @ApiProperty({
    example: 'John Doe',
    description: 'The full name of the user',
    required: false,
  })
  name?: string;

  @Expose()
  @ApiProperty({
    example: 'johndoe',
    description: 'The username of the user',
    required: false,
  })
  username?: string;

  @Expose()
  @ApiProperty({
    example: 'john@example.com',
    description: 'The email address of the user',
  })
  email: string;

  @Expose()
  @ApiProperty({
    example: '+1234567890',
    description: 'The phone number of the user',
    required: false,
  })
  phone?: string;

  @Expose()
  @ApiProperty({
    example: 'local',
    description: 'The authentication provider (local, google, facebook)',
  })
  provider: string;

  @Expose()
  @ApiProperty({
    example: true,
    description: 'Whether the user account is active',
  })
  isActive: boolean;

  @Expose()
  @ApiProperty({
    example: 'user',
    description: 'Whether user or admin',
  })
  role: string;

  @Expose()
  @ApiProperty({
    example: '2023-01-01T00:00:00.000Z',
    description: 'The date when the user was created',
  })
  createdAt: Date;
}
