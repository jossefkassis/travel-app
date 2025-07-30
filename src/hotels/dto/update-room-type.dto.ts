import { IsString, IsNumber, IsOptional, Min, Max, IsArray } from 'class-validator';

export class UpdateRoomTypeDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  @Max(12)
  @IsOptional()
  capacity?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  totalRooms?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  baseNightlyRate?: number;

  @IsNumber()
  @IsOptional()
  mainImageId?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  galleryImageIds?: number[];
} 