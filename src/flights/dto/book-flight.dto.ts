import { IsNumber, IsOptional, IsArray, IsString, Min } from 'class-validator';

export class BookFlightDto {
  @IsNumber()
  flightId: number;

  @IsNumber()
  classId: number;

  @IsNumber()
  @Min(1)
  numberOfSeats: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatNumbers?: string[]; // e.g., ['12A', '12B']
} 