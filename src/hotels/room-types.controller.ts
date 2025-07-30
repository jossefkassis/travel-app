import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, Query, ParseIntPipe } from '@nestjs/common';
import { RoomTypesService } from './room-types.service';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';

@Controller('hotels/:hotelId/room-types')
export class RoomTypesController {
  constructor(private readonly roomTypesService: RoomTypesService) {}

  @Get()
  async findAll(
    @Param('hotelId', ParseIntPipe) hotelId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy') orderBy?: 'createdAt' | 'label' | 'baseNightlyRate' | 'capacity',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minCapacity') minCapacity?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const orderDirValue = orderDir || 'desc';
    const orderByValue = orderBy || 'createdAt';
    const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
    const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
    const minCapacityNum = minCapacity ? parseInt(minCapacity, 10) : undefined;

    return this.roomTypesService.findAll(
      hotelId,
      pageNum,
      limitNum,
      orderByValue,
      orderDirValue,
      { 
        isActive: isActiveBool, 
        search, 
        minPrice: minPriceNum,
        maxPrice: maxPriceNum,
        minCapacity: minCapacityNum
      },
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roomTypesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('hotelId', ParseIntPipe) hotelId: number,
    @Body() createRoomTypeDto: CreateRoomTypeDto,
  ) {
    return this.roomTypesService.create(hotelId, createRoomTypeDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoomTypeDto: UpdateRoomTypeDto,
  ) {
    return this.roomTypesService.update(id, updateRoomTypeDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.roomTypesService.remove(id);
  }
} 