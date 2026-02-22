import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { ListTxDto } from './dot/list-tx.dto';
import { RequestTopupDto } from './dot/request-topup.dto';
import { ListRequestsDto } from './dot/list-requests.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Get('me')
  getMyWallet(@CurrentUser() user: any) {
    return this.service.getWallet(user.sub);
  }

  @Get('transactions')
  myTransactions(@CurrentUser() user: any, @Query() q: ListTxDto) {
    return this.service.listTransactions(
      user.sub,
      q.type,
      q.page ?? 1,
      q.limit ?? 20,
    );
  }

  @Post('requests')
  requestTopup(@CurrentUser() user: any, @Body() dto: RequestTopupDto) {
    return this.service.requestTopup(user.sub, dto);
  }

  @Get('requests')
  myRequests(@CurrentUser() user: any, @Query() q: ListRequestsDto) {
    return this.service.listMyRequests(
      user.sub,
      q.status,
      q.page ?? 1,
      q.limit ?? 20,
    );
  }
}
