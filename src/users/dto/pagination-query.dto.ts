// dto/pagination-query.dto.ts
import { IsOptional, IsInt, Min, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({
    example: 2,
    description:
      'Filter users by Role ID (e.g., 1=Super Admin, 2=Customer, 3=Guide)',
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  roleId?: number;
}
