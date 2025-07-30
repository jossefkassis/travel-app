import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, Query, ParseIntPipe } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'name' | 'stars' | 'avgRating',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('cityId') cityId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('stars') stars?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const orderDirValue = orderDir || 'desc';
    const orderByValue = orderBy || 'createdAt';
    const cityIdNum = cityId ? parseInt(cityId, 10) : undefined;
    const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
    const starsNum = stars ? parseInt(stars, 10) : undefined;

    return this.hotelsService.findAll(
      pageNum,
      limitNum,
      orderByValue,
      orderDirValue,
      { 
        cityId: cityIdNum, 
        isActive: isActiveBool, 
        search, 
        stars: starsNum 
      },
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hotelsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createHotelDto: CreateHotelDto) {
    return this.hotelsService.create(createHotelDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHotelDto: UpdateHotelDto,
  ) {
    return this.hotelsService.update(id, updateHotelDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.hotelsService.remove(id);
  }
} 