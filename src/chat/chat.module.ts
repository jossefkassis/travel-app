import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database.module';
import { ChatController } from './chat.controller';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
})
export class ChatModule {} 