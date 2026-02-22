import {
  IsNumber,
  IsDateString,
  IsOptional,
  Min,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BookHotelDto {
  @ApiProperty({ description: 'Room type ID', example: 1 })
  @IsNumber()
  roomTypeId: number;

  @ApiProperty({
    description: 'Check-in date (YYYY-MM-DD)',
    example: '2024-07-14',
  })
  @IsDateString()
  checkInDate: string;

  @ApiProperty({
    description: 'Check-out date (YYYY-MM-DD)',
    example: '2024-07-18',
  })
  @IsDateString()
  checkOutDate: string;

  @ApiProperty({
    description: 'Number of rooms to book',
    example: 2,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  roomsBooked: number;

  @ApiProperty({
    description: 'Source ID for trip bookings',
    required: false,
    example: 123,
  })
  @IsOptional()
  @IsNumber()
  sourceId?: number; // For trip bookings

  @ApiProperty({
    description: 'Booking source',
    required: false,
    enum: ['PREDEFINED_TRIP', 'CUSTOM_TRIP', 'HOTEL_ONLY'],
    default: 'HOTEL_ONLY',
  })
  @IsOptional()
  @IsEnum(['PREDEFINED_TRIP', 'CUSTOM_TRIP', 'HOTEL_ONLY'])
  source?: 'PREDEFINED_TRIP' | 'CUSTOM_TRIP' | 'HOTEL_ONLY';
}
