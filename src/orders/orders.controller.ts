import { Controller, Get, UseGuards, Query, Post, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../typings/express';
import { OrdersService } from './orders.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permission, SetPermissions } from 'src/common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.cancelOrder({ id: user.id, roleId: user.roleId }, parseInt(id, 10));
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async listUserOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tripId') tripId?: string,
    @Query('hotelId') hotelId?: string,
  ) {
    const filters: any = {};
    if (tripId) filters.tripId = parseInt(tripId, 10);
    if (hotelId) filters.hotelId = parseInt(hotelId, 10);
    return this.ordersService.listUserOrders(user.id, filters);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @SetPermissions(Permission.PaymentViewAll)
  async listAllOrdersAdmin(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const opts: any = {};
    if (page) opts.page = parseInt(page, 10);
    if (limit) opts.limit = parseInt(limit, 10);
    if (search) opts.search = search;
    if (status) opts.status = status;
    if (startDate) opts.startDate = startDate;
    if (endDate) opts.endDate = endDate;
    return this.ordersService.listAllOrders(opts);
  }
}


