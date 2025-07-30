import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { RoomTypesController } from './room-types.controller';
import { RoomTypesService } from './room-types.service';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HotelsController, RoomTypesController],
  providers: [HotelsService, RoomTypesService],
  exports: [HotelsService, RoomTypesService],
})
export class HotelsModule {} 