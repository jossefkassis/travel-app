import { ApiProperty } from '@nestjs/swagger';

export class BookHotelResponseDto {
  @ApiProperty({ description: 'Reservation ID', example: 1 })
  reservationId: number;

  @ApiProperty({ description: 'Order ID', example: 1 })
  orderId: number;

  @ApiProperty({ description: 'Total amount for the booking', example: 800.00 })
  totalAmount: number;

  @ApiProperty({ description: 'Check-in date', example: '2024-07-14' })
  checkInDate: string;

  @ApiProperty({ description: 'Check-out date', example: '2024-07-18' })
  checkOutDate: string;

  @ApiProperty({ description: 'Number of rooms booked', example: 2 })
  roomsBooked: number;

  @ApiProperty({ description: 'Room type label', example: 'Deluxe Room' })
  roomTypeLabel: string;

  @ApiProperty({ description: 'Hotel name', example: 'Grand Hotel' })
  hotelName: string;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  currency: string;

  @ApiProperty({ description: 'Number of nights', example: 4 })
  numberOfNights: number;
} 