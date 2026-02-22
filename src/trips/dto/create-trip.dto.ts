import {
  IsString,
  IsNumber,
  IsDateString,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { tripTypeEnum } from '../../db/schema';

export class TripDayDto {
  @ApiProperty({ description: 'Day number', example: 1 })
  @IsNumber()
  dayNumber: number;

  @ApiProperty({ description: 'Start time (HH:MM)', example: '09:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ description: 'End time (HH:MM)', example: '18:00' })
  @IsString()
  endTime: string;

  @ApiProperty({
    description: 'Description of the day',
    example: 'Explore the historic city center',
  })
  @IsOptional()
  @IsString()
  description?: string;
}

export class TripPoiDto {
  @ApiProperty({ description: 'POI ID to visit', example: 1 })
  @IsNumber()
  poiId: number;

  @ApiProperty({ description: 'Visit order in the day', example: 1 })
  @IsNumber()
  @Min(1)
  visitOrder: number;
}

export class TripDayWithPoisDto extends TripDayDto {
  @ApiProperty({ description: 'POIs to visit on this day', type: [TripPoiDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripPoiDto)
  pois: TripPoiDto[];
}

export class TripHotelDto {
  @ApiProperty({ description: 'Hotel ID', example: 1 })
  @IsNumber()
  hotelId: number;

  @ApiProperty({ description: 'Room type ID', example: 1 })
  @IsNumber()
  roomTypeId: number;

  @ApiProperty({ description: 'Number of rooms needed', example: 2 })
  @IsNumber()
  @Min(1)
  roomsNeeded: number;
}

export class CreateTripDto {
  @ApiProperty({ description: 'Trip name', example: 'Paris Adventure Tour' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'City ID', example: 1 })
  @IsNumber()
  cityId: number;

  @ApiProperty({
    description: 'Trip type',
    enum: ['CUSTOM', 'PREDEFINED'],
    default: 'PREDEFINED',
  })
  @IsEnum(['CUSTOM', 'PREDEFINED'])
  tripType: 'CUSTOM' | 'PREDEFINED';

  @ApiProperty({
    description: 'Start date (YYYY-MM-DD)',
    example: '2025-08-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)', example: '2025-08-05' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: 'Price per person', example: 500.0 })
  @IsNumber()
  pricePerPerson: number;

  @ApiProperty({ description: 'Minimum number of people', example: 1 })
  @IsNumber()
  @Min(1)
  minPeople: number;

  @ApiProperty({ description: 'Maximum number of people', example: 10 })
  @IsNumber()
  @Min(1)
  maxPeople: number;

  @ApiProperty({ description: 'Minimum seats per user', example: 1 })
  @IsNumber()
  @Min(1)
  minSeatsPerUser: number;

  @ApiProperty({ description: 'Maximum seats per user', example: 2 })
  @IsNumber()
  @Min(1)
  maxSeatsPerUser: number;

  @ApiProperty({ description: 'Whether meals are included', example: true })
  @IsBoolean()
  withMeals: boolean;

  @ApiProperty({ description: 'Whether transport is included', example: true })
  @IsBoolean()
  withTransport: boolean;

  @ApiProperty({ description: 'Whether hotel is included', example: true })
  @IsBoolean()
  hotelIncluded: boolean;

  @ApiProperty({
    description: 'Meal price per person for whole trip',
    example: 100.0,
  })
  @IsOptional()
  @IsNumber()
  mealPricePerPerson?: number;

  @ApiProperty({
    description: 'Transportation price per person for whole trip',
    example: 50.0,
  })
  @IsOptional()
  @IsNumber()
  transportationPricePerPerson?: number;

  @ApiProperty({ description: 'Guide ID', example: 'uuid-here' })
  @IsOptional()
  @IsString()
  guideId?: string;

  @ApiProperty({
    description: 'Meet location address',
    example: '123 Main St, Paris',
  })
  @IsOptional()
  @IsString()
  meetLocationAddress?: string;

  @ApiProperty({
    description: 'Meet location coordinates',
    example: { lat: 48.8566, lon: 2.3522 },
  })
  @IsOptional()
  meetLocation?: { lat: number; lon: number };

  @ApiProperty({
    description: 'Drop location address',
    example: '456 End St, Paris',
  })
  @IsOptional()
  @IsString()
  dropLocationAddress?: string;

  @ApiProperty({
    description: 'Drop location coordinates',
    example: { lat: 48.8566, lon: 2.3522 },
  })
  @IsOptional()
  dropLocation?: { lat: number; lon: number };

  @ApiProperty({ description: 'Main image ID', example: 1, required: false })
  @IsOptional()
  @IsNumber()
  mainImageId?: number;

  @ApiProperty({
    description: 'Gallery image IDs',
    example: [2, 3, 4],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  galleryImageIds?: number[];

  @ApiProperty({
    description: 'Trip days with POIs',
    type: [TripDayWithPoisDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDayWithPoisDto)
  tripDays: TripDayWithPoisDto[];

  @ApiProperty({
    description: 'Hotels for the trip',
    type: [TripHotelDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripHotelDto)
  hotels?: TripHotelDto[];

  @ApiProperty({
    description: 'Tag IDs for the trip',
    example: [1, 2, 3],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tagIds?: number[];
}
