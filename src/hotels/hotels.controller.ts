import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { HotelsService } from './hotels.service';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { BookHotelDto } from './dto/book-hotel.dto';
import { BookHotelResponseDto } from './dto/book-hotel-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../typings/express';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all hotels with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Hotels retrieved successfully' })
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
    const isActiveBool =
      isActive !== undefined ? isActive === 'true' : undefined;
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
        stars: starsNum,
      },
    );
  }

  @Get('available')
  async findAvailable(
    @Query('cityId') cityId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.hotelsService.findAvailable({
      cityId: parseInt(cityId, 10),
      startDate,
      endDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific hotel by ID' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiResponse({ status: 200, description: 'Hotel retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Hotel not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.hotelsService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new hotel' })
  @ApiResponse({ status: 201, description: 'Hotel created successfully' })
  async create(@Body() createHotelDto: CreateHotelDto) {
    return this.hotelsService.create(createHotelDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a hotel' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiResponse({ status: 200, description: 'Hotel updated successfully' })
  @ApiResponse({ status: 404, description: 'Hotel not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateHotelDto: UpdateHotelDto,
  ) {
    return this.hotelsService.update(id, updateHotelDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a hotel' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiResponse({ status: 200, description: 'Hotel deleted successfully' })
  @ApiResponse({ status: 404, description: 'Hotel not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.hotelsService.remove(id);
  }

  @Get(':hotelId/room-types/:roomTypeId/availability')
  @ApiOperation({ summary: 'Check room availability for specific dates' })
  @ApiParam({ name: 'hotelId', description: 'Hotel ID' })
  @ApiParam({ name: 'roomTypeId', description: 'Room Type ID' })
  @ApiQuery({ name: 'checkInDate', description: 'Check-in date (YYYY-MM-DD)' })
  @ApiQuery({
    name: 'checkOutDate',
    description: 'Check-out date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'roomsRequested',
    description: 'Number of rooms requested',
  })
  @ApiResponse({ status: 200, description: 'Availability check completed' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  async checkAvailability(
    @Param('hotelId', ParseIntPipe) hotelId: number,
    @Param('roomTypeId', ParseIntPipe) roomTypeId: number,
    @Query('checkInDate') checkInDate: string,
    @Query('checkOutDate') checkOutDate: string,
    @Query('roomsRequested') roomsRequested: string,
  ) {
    if (!checkInDate || !checkOutDate || !roomsRequested) {
      throw new BadRequestException(
        'checkInDate, checkOutDate, and roomsRequested are required',
      );
    }

    const roomsRequestedNum = parseInt(roomsRequested, 10);

    if (isNaN(roomsRequestedNum) || roomsRequestedNum < 1) {
      throw new BadRequestException('roomsRequested must be a positive number');
    }

    return this.hotelsService.checkRoomAvailability(
      roomTypeId,
      checkInDate,
      checkOutDate,
      roomsRequestedNum,
    );
  }

  @Post(':hotelId/room-types/:roomTypeId/book')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book a hotel room' })
  @ApiParam({ name: 'hotelId', description: 'Hotel ID' })
  @ApiParam({ name: 'roomTypeId', description: 'Room Type ID' })
  @ApiResponse({
    status: 201,
    description: 'Room booked successfully',
    type: BookHotelResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid booking request or room not available',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bookRoom(
    @Param('hotelId', ParseIntPipe) hotelId: number,
    @Param('roomTypeId', ParseIntPipe) roomTypeId: number,
    @Body() bookHotelDto: BookHotelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BookHotelResponseDto> {
    console.log('hit');
    // Ensure the roomTypeId in the DTO matches the URL parameter
    bookHotelDto.roomTypeId = Number(roomTypeId);
    console.log('booking ', bookHotelDto);
    return this.hotelsService.bookRoom(user.id, bookHotelDto);
  }

  
}
