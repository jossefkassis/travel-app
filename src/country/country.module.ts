import { Module, forwardRef } from '@nestjs/common';
import { CountryService } from './country.service';
import { CountryController } from './country.controller';
import { DatabaseModule } from 'src/database.module';
import { CityModule } from '../city/city.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => CityModule)],
  controllers: [CountryController],
  providers: [CountryService],
  exports: [CountryService],
})
export class CountryModule {}
