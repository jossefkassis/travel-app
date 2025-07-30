import { Module } from '@nestjs/common';
import { AttractionsService } from './attractions.service';
import { AttractionsController } from './attractions.controller';
import { PoiTypesController } from './poi-types.controller';
import { DatabaseModule } from '../database.module';
import { TagsController } from './tags.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AttractionsController, PoiTypesController,TagsController],
  providers: [AttractionsService],
  exports: [AttractionsService],
})
export class AttractionsModule {} 