import { PartialType } from '@nestjs/swagger';
import { CreatePoiTypeDto } from './create-poi-type.dto';

export class UpdatePoiTypeDto extends PartialType(CreatePoiTypeDto) {} 