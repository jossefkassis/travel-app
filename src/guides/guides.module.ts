import { Module, forwardRef } from '@nestjs/common';
import { GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';
import { DatabaseModule } from '../database.module';
import { UsersModule } from '../users/users.module';
import { CityModule } from '../city/city.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => UsersModule), forwardRef(() => CityModule)],
  controllers: [GuidesController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {} 