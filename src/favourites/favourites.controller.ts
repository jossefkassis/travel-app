/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpsertFavouriteDto } from './dto/upsert-favourite.dto';
import { ListFavouritesDto } from './dto/list-favourites.dto';
import { FavouritesService } from './favourites.service';

@Controller('favourites')
export class FavouritesController {
  constructor(private readonly service: FavouritesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  add(@CurrentUser() user: any, @Body() dto: UpsertFavouriteDto) {
    return this.service.add(user?.sub, dto.entityType, dto.entityId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  remove(@CurrentUser() user: any, @Body() dto: UpsertFavouriteDto) {
    return this.service.remove(user.sub, dto.entityType, dto.entityId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  listMine(@CurrentUser() user: any, @Query() q: ListFavouritesDto) {
    return this.service.listMine(user.sub, q.type, q.page ?? 1, q.limit ?? 20);
  }

  @Get(':type/:id')
  listAll(
    @Param('type') type: any,
    @Param('id') id: string,
    @Query() q: ListFavouritesDto,
  ) {
    return this.service.listFavourites(type, +id, q.page ?? 1, q.limit ?? 20);
  }
}
