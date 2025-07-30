import { Module, forwardRef } from '@nestjs/common';
import { CityService } from './city.service';
import { CityController } from './city.controller';
import { DatabaseModule } from '../database.module';
import { CountryModule } from '../country/country.module';
import { HotelsModule } from '../hotels/hotels.module';
import { AttractionsModule } from '../attractions/attractions.module';

@Module({
  imports: [
    DatabaseModule, 
    forwardRef(() => CountryModule),
    forwardRef(() => HotelsModule),
    forwardRef(() => AttractionsModule),
  ],
  controllers: [CityController],
  providers: [CityService],
  exports: [CityService],
})
export class CityModule {}
