import {
  IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsUUID, Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class DraftPoiDto {
  @IsInt() @Min(1) poiId: number;
  @IsInt() @Min(1) dayNumber: number;
  @IsInt() @Min(1) visitOrder: number;
}

export class DraftHotelRequestDto {
  @IsInt() @Min(1) roomTypeId: number;
  @IsInt() @Min(0) roomsRequested: number;
}

export class PointDto {
  @IsOptional() locationAddress?: string;
  @IsNumber() lon: number;
  @IsNumber() lat: number;
}

export class CalculateTripDraftDto {
  @IsInt() @Min(1) cityId: number;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsInt() @Min(1) people: number;

  @IsBoolean() withMeals: boolean;
  @IsBoolean() withTransport: boolean;
  @IsBoolean() hotelIncluded: boolean;

  // optional meet/drop; if omitted we’ll fallback to first/last POI coords
  @IsOptional() @ValidateNested() @Type(() => PointDto) meetLocation?: PointDto;
  @IsOptional() @ValidateNested() @Type(() => PointDto) dropLocation?: PointDto;

  @IsBoolean() @IsOptional() includeGuide?: boolean;
  @IsUUID() @IsOptional() guideId?: string;

  @IsOptional() @ValidateNested({ each: true }) @Type(() => DraftHotelRequestDto)
  hotels?: DraftHotelRequestDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => DraftPoiDto)
  pois: DraftPoiDto[];
}
