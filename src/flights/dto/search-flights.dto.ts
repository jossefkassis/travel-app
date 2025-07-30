import { IsString, IsDateString, IsOptional, IsNumber, Min } from 'class-validator';

export class SearchFlightsDto {
  @IsString()
  origin: string; // Airport code (e.g., 'JFK')

  @IsString()
  destination: string; // Airport code (e.g., 'LAX')

  @IsDateString()
  departureDate: string; // ISO date string

  @IsOptional()
  @IsDateString()
  returnDate?: string; // ISO date string for round trip

  @IsOptional()
  @IsNumber()
  @Min(1)
  passengers?: number = 1;
} 