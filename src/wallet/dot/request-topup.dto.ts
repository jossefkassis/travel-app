import { IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class RequestTopupDto {
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
