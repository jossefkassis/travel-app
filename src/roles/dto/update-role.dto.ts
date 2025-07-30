import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  permissionIds?: number[];
} 