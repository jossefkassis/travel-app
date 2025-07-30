import { IsString, IsNumber, IsDateString, IsOptional } from 'class-validator';

export class CreateFlightDto {
  @IsString()
  flightNo: string;

  @IsNumber()
  origin: number; // Airport ID

  @IsNumber()
  destination: number; // Airport ID

  @IsNumber()
  airlineId: number;

  @IsDateString()
  departureAt: string;

  @IsDateString()
  arrivalAt: string;

  @IsOptional()
  @IsString()
  status?: string = 'SCHEDULED';
} 