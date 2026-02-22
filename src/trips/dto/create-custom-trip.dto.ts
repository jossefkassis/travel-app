// create-custom-trip.dto.ts
import { IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTripDto } from './create-trip.dto';

export class CreateAndBookCustomTripDto {
  @ValidateNested() @Type(() => CreateTripDto)
  trip!: CreateTripDto;            // trip.tripType MUST be 'CUSTOM'

  @IsNumber() @Min(1)
  seats!: number;                  // how many people to book
}
