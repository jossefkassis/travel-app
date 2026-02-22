import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { DatabaseModule } from 'src/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HomeController],
})
export class HomeModule {}
