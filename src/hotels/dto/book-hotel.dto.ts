import { IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class BookHotelDto {
  @IsNumber()
  hotelId: number;

  @IsNumber()
  roomTypeId: number;

  @IsDateString()
  checkInDate: string;

  @IsDateString()
  checkOutDate: string;

  @IsNumber()
  @Min(1)
  roomsBooked: number;

  @IsOptional()
  @IsNumber()
  sourceId?: number; // For trip bookings
} 