import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertReviewDto {
  @IsString()
  @IsIn(['city', 'country', 'hotel', 'poi', 'trip'])
  entityType!: 'city' | 'country' | 'hotel' | 'poi' | 'trip';

  @IsInt()
  @IsPositive()
  entityId!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}
