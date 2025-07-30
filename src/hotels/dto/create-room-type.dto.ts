import { IsString, IsNumber, IsNotEmpty, IsOptional, Min, Max, IsArray } from 'class-validator';

export class CreateRoomTypeDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(1)
  @Max(12)
  capacity: number;

  @IsNumber()
  @Min(1)
  totalRooms: number;

  @IsNumber()
  @Min(0)
  baseNightlyRate: number;

  @IsNumber()
  @IsOptional()
  mainImageId?: number;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  galleryImageIds?: number[];
} 