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
import { UpsertReviewDto } from './dto/upsert-review.dto';
import { ListReviewsDto } from './dto/list-reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  // Public list under an entity (anyone can see)
  @Get(':type/:id')
  list(
    @Param('type') type: any,
    @Param('id') id: string,
    @Query() q: ListReviewsDto,
  ) {
    return this.service.list(type, +id, q.page ?? 1, q.limit ?? 20);
  }

  // Create/Update (one review per user per entity)
  @UseGuards(JwtAuthGuard)
  @Post()
  upsert(@CurrentUser() user: any, @Body() dto: UpsertReviewDto) {
    return this.service.upsert(
      user.sub,
      dto.entityType,
      dto.entityId,
      dto.rating,
      dto.comment,
    );
  }

  // Delete own review
  @UseGuards(JwtAuthGuard)
  @Delete(':reviewId')
  removeMine(@CurrentUser() user: any, @Param('reviewId') reviewId: string) {
    return this.service.removeMine(user.sub, +reviewId);
  }
}
