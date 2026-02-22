import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
