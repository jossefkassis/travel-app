import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListFavouritesDto {
  @IsOptional()
  @IsIn(['city', 'country', 'hotel', 'poi', 'trip'])
  type?: 'city' | 'country' | 'hotel' | 'poi' | 'trip';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
