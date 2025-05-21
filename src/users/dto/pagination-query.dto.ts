// dto/pagination-query.dto.ts
import { IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum SortBy {
  NAME = 'name',
  DATE = 'date',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.DATE;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.DESC;
}
