import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { ListRequestsDto } from './dot/list-requests.dto';
import { AdminNoteDto } from './dot/admin-note.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/wallet')
export class WalletAdminController {
  constructor(private readonly service: WalletService) {}

  @Get('requests')
  listAll(@Query() q: ListRequestsDto) {
    return this.service.listAllRequests(q.status, q.page ?? 1, q.limit ?? 20);
  }

  @Patch('requests/:id/approve')
  approve(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Body() dto: AdminNoteDto,
  ) {
    console.log("hit")
    return this.service.approveRequest(admin.sub, +id, dto.note);
  }

  @Patch('requests/:id/reject')
  reject(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Body() dto: AdminNoteDto,
  ) {
    return this.service.rejectRequest(admin.sub, +id, dto.note);
  }

  @Get('transactions')
  listTransactions(@Query() q: any) {
    return this.service.listAllTransactions(
      { search: q.search, status: q.status, source: q.source },
      q.page ?? 1,
      q.limit ?? 20,
    );
  }
}
