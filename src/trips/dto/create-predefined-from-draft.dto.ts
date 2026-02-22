import { IsInt, Min, IsUUID, ValidateNested, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { CalculateTripDraftDto, PointDto } from './calc-trip.dto';

export class CreatePredefinedFromDraftDto {
  @ValidateNested() @Type(() => CalculateTripDraftDto)
  draft: CalculateTripDraftDto;

  @IsInt() @Min(1) minSeatsPerUser: number;
  @IsInt() @Min(1) maxSeatsPerUser: number;
  @IsInt() @Min(1) minPeople: number;
  @IsInt() @Min(1) maxPeople: number;

  @IsOptional() @IsString() name?: string;
  @IsOptional() @ValidateNested() @Type(() => PointDto) meetLocation?: PointDto;
  @IsOptional() @ValidateNested() @Type(() => PointDto) dropLocation?: PointDto;
  @IsOptional() @IsString() meetLocationAddress?: string;
  @IsOptional() @IsString() dropLocationAddress?: string;
}
