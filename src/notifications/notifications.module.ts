import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { DatabaseModule } from 'src/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
