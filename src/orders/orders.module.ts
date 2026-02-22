import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { DatabaseModule } from '../database.module';
import { TripsModule } from 'src/trips/trips.module';
import { HotelsModule } from 'src/hotels/hotels.module';

@Module({
  imports: [DatabaseModule, TripsModule, HotelsModule],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}


