import { IsIn, IsInt, IsPositive, IsString } from 'class-validator';

export class UpsertFavouriteDto {
  @IsString()
  @IsIn(['city', 'country', 'hotel', 'poi', 'trip'])
  entityType!: 'city' | 'country' | 'hotel' | 'poi' | 'trip';

  @IsInt()
  @IsPositive()
  entityId!: number;
}
