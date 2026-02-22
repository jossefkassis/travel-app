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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../typings/express';
import { CalculateTripDraftDto } from './dto/calc-trip.dto';
import { CreatePredefinedFromDraftDto } from './dto/create-predefined-from-draft.dto';
import { CreateAndBookCustomTripDto } from './dto/create-custom-trip.dto';

@ApiTags('Trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all trips with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Trips retrieved successfully' })
  @ApiQuery({
    name: 'cityId',
    required: false,
    description: 'Filter trips by city ID',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('orderBy')
    orderBy?: 'createdAt' | 'name' | 'pricePerPerson' | 'startDate',
    @Query('orderDir') orderDir?: 'asc' | 'desc',
    @Query('tripType') tripType?: 'CUSTOM' | 'PREDEFINED',
    @Query('withMeals') withMeals?: string,
    @Query('withTransport') withTransport?: string,
    @Query('hotelIncluded') hotelIncluded?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minPeople') minPeople?: string,
    @Query('maxPeople') maxPeople?: string,
    @Query('cityId') cityId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const orderDirValue = orderDir || 'desc';
    const orderByValue = orderBy || 'createdAt';
    const withMealsBool =
      withMeals !== undefined ? withMeals === 'true' : undefined;
    const withTransportBool =
      withTransport !== undefined ? withTransport === 'true' : undefined;
    const hotelIncludedBool =
      hotelIncluded !== undefined ? hotelIncluded === 'true' : undefined;
    const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
    const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
    const minPeopleNum = minPeople ? parseInt(minPeople, 10) : undefined;
    const maxPeopleNum = maxPeople ? parseInt(maxPeople, 10) : undefined;
    const cityIdNum = cityId ? parseInt(cityId, 10) : undefined;

    return this.tripsService.findAll(
      pageNum,
      limitNum,
      orderByValue,
      orderDirValue,
      {
        tripType: 'PREDEFINED',
        withMeals: withMealsBool,
        withTransport: withTransportBool,
        hotelIncluded: hotelIncludedBool,
        search,
        minPrice: minPriceNum,
        maxPrice: maxPriceNum,
        minPeople: minPeopleNum,
        maxPeople: maxPeopleNum,
        cityId: cityIdNum,
      },
    );
  }


  @Get('bookings')
  @UseGuards(JwtAuthGuard)
  listMyBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.listMyTripBookings(user.id);
  }
  @Delete('bookings/:id')
  @UseGuards(JwtAuthGuard)
  cancelBooking(
    @Param('id', ParseIntPipe) bookingId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tripsService.cancelTripBooking(
      user.id,
      bookingId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific trip by ID' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.findOne(id);
  }

  @Post(':id/book')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Book a predefined trip' })
  async bookTrip(
    @Param('id', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: { seats: number },
  ) {
    return this.tripsService.bookTrip(user.id, {
      tripId,
      seats: dto.seats,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new trip' })
  @ApiResponse({ status: 201, description: 'Trip created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid trip data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @Body() createTripDto: CreateTripDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    console.log(createTripDto);
    return this.tripsService.create(user.id, createTripDto);
  }


  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a trip' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip updated successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTripDto: UpdateTripDto,
  ) {
    return this.tripsService.update(id, updateTripDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a trip' })
  @ApiParam({ name: 'id', description: 'Trip ID' })
  @ApiResponse({ status: 200, description: 'Trip deleted successfully' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.tripsService.remove(id);
  }

  @Get('hotels/:cityId')
  @ApiOperation({
    summary: 'Get hotels with room types by city for trip planning',
  })
  @ApiParam({ name: 'cityId', description: 'City ID' })
  @ApiResponse({ status: 200, description: 'Hotels retrieved successfully' })
  async getHotelsByCity(@Param('cityId', ParseIntPipe) cityId: number) {
    return this.tripsService.getHotelsByCity(cityId);
  }


  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async calculate(@Body() draft: CalculateTripDraftDto) {
    return this.tripsService.calculateCustomTripPrice(draft);
  }


  @Post('predefined/quote')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async predefinedQuote(@Body() body: { draft: CalculateTripDraftDto }) {
    return this.tripsService.calculateCustomTripPrice(body.draft);
  }

  // PREDEFINED: CREATE (reserve guide + room inventory, NO booking)
  @Post('predefined/create')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async predefinedCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePredefinedFromDraftDto) {
    return this.tripsService.createTripFromDraftUnified(
      user.id,
      { ...body.draft, ...body },
      'PREDEFINED',
      {
        bookNow: false,
        seatPolicy: {
          minSeatsPerUser: body.minSeatsPerUser,
          maxSeatsPerUser: body.maxSeatsPerUser,
          minPeople: body.minPeople,
          maxPeople: body.maxPeople,
        },
      }
    );
  }

  @Post('custom/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async customConfirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() draft: CalculateTripDraftDto,
  ) {
    return this.tripsService.createTripFromDraftUnified(
      user.id,
      draft,
      'CUSTOM',
      { bookNow: true }
    );
  }

@Post('custom')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
async createAndBookCustom(
  @CurrentUser() user: AuthenticatedUser,
  @Body() dto: CreateAndBookCustomTripDto,
) {
  console.log("the data",dto)
  return this.tripsService.createCustomTripAndBook(user.id, dto);
}
}
