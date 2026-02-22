import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class ListTxDto {
  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: 'CREDIT' | 'DEBIT'; // we'll infer by sign; this is just a filter convenience

  @IsOptional() @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) limit?: number = 20;
}
