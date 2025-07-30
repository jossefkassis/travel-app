// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   UseGuards,
//   Query,
//   ParseIntPipe,
// } from '@nestjs/common';
// import { FlightsService } from './flights.service';
// import { SearchFlightsDto } from './dto/search-flights.dto';
// import { BookFlightDto } from './dto/book-flight.dto';
// import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
// import { CurrentUser } from '../common/decorators/current-user.decorator';

// @Controller('flights')
// export class FlightsController {
//   constructor(private readonly flightsService: FlightsService) {}

//   @Get('search')
//   async searchFlights(@Query() searchDto: SearchFlightsDto) {
//     return await this.flightsService.searchFlights(searchDto);
//   }

//   @Get(':id')
//   async getFlight(@Param('id', ParseIntPipe) id: number) {
//     return await this.flightsService.getFlightById(id);
//   }

//   @Post('book')
//   @UseGuards(JwtAuthGuard)
//   async bookFlight(
//     @Body() bookFlightDto: BookFlightDto,
//     @CurrentUser() user: any,
//   ) {
//     return await this.flightsService.bookFlight(bookFlightDto, user.sub);
//   }

//   @Get('bookings/my')
//   @UseGuards(JwtAuthGuard)
//   async getMyBookings(@CurrentUser() user: any) {
//     return await this.flightsService.getUserBookings(user.sub);
//   }

//   @Post('bookings/:id/cancel')
//   @UseGuards(JwtAuthGuard)
//   async cancelBooking(
//     @Param('id', ParseIntPipe) bookingId: number,
//     @CurrentUser() user: any,
//   ) {
//     return await this.flightsService.cancelBooking(bookingId, user.sub);
//   }
// } 