import { Controller, Get, UseGuards, Req, Param, ParseIntPipe, Query } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user?.id;
    return this.chat.listRoomsForUser(userId);
  }

  @Get(':id/messages')
  async messages(
    @Param('id', ParseIntPipe) id: number,
    @Query('beforeId') beforeId?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    const userId = req.user?.id;
    await this.chat.assertMember(id, userId);
    const items = await this.chat.recent(id, limit ? parseInt(limit, 10) : undefined, beforeId ? parseInt(beforeId, 10) : undefined);
    return { chatRoomId: id, items };
  }
}
