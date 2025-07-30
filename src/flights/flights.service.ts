// import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// import { Inject } from '@nestjs/common';
// import { DRIZLE } from '../database.module';
// import { NodePgDatabase } from 'drizzle-orm/node-postgres';
// import * as schema from '../db/schema';
// import { and, eq, gte, lte, desc, asc, sql } from 'drizzle-orm';
// import { CreateFlightDto } from './dto/create-flight.dto';
// import { SearchFlightsDto } from './dto/search-flights.dto';
// import { BookFlightDto } from './dto/book-flight.dto';

// @Injectable()
// export class FlightsService {
//   constructor(
//     @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
//   ) {}

//   async searchFlights(searchDto: SearchFlightsDto) {
//     const { origin, destination, departureDate, returnDate, passengers } = searchDto;

//     // Get origin and destination airports
//     const originAirport = await this.db.query.airports.findFirst({
//       where: eq(schema.airports.code, origin),
//     });

//     const destinationAirport = await this.db.query.airports.findFirst({
//       where: eq(schema.airports.code, destination),
//     });

//     if (!originAirport || !destinationAirport) {
//       throw new BadRequestException('Invalid airport codes');
//     }

//     // Build departure date range
//     const departureStart = new Date(departureDate);
//     departureStart.setHours(0, 0, 0, 0);
//     const departureEnd = new Date(departureDate);
//     departureEnd.setHours(23, 59, 59, 999);

//     // Search for outbound flights
//     const outboundFlights = await this.db.query.flights.findMany({
//       where: and(
//         eq(schema.flights.origin, originAirport.id),
//         eq(schema.flights.destination, destinationAirport.id),
//         gte(schema.flights.departureAt, departureStart),
//         lte(schema.flights.departureAt, departureEnd),
//         eq(schema.flights.is_active, true),
//       ),
//       with: {
//         airline: true,
//         originAirport: {
//           with: {
//             city: {
//               with: {
//                 country: true,
//               },
//             },
//           },
//         },
//         destinationAirport: {
//           with: {
//             city: {
//               with: {
//                 country: true,
//               },
//             },
//           },
//         },
//         flightInventory: {
//           with: {
//             seatClass: true,
//           },
//         },
//       },
//       orderBy: [asc(schema.flights.departureAt)],
//     });

//     let returnFlights = [];
//     if (returnDate) {
//       const returnStart = new Date(returnDate);
//       returnStart.setHours(0, 0, 0, 0);
//       const returnEnd = new Date(returnDate);
//       returnEnd.setHours(23, 59, 59, 999);

//       returnFlights = await this.db.query.flights.findMany({
//         where: and(
//           eq(schema.flights.origin, destinationAirport.id),
//           eq(schema.flights.destination, originAirport.id),
//           gte(schema.flights.departureAt, returnStart),
//           lte(schema.flights.departureAt, returnEnd),
//           eq(schema.flights.is_active, true),
//         ),
//         with: {
//           airline: true,
//           originAirport: {
//             with: {
//               city: {
//                 with: {
//                   country: true,
//                 },
//               },
//             },
//           },
//           destinationAirport: {
//             with: {
//               city: {
//                 with: {
//                   country: true,
//                 },
//               },
//             },
//           },
//           flightInventory: {
//             with: {
//               seatClass: true,
//             },
//           },
//         },
//         orderBy: [asc(schema.flights.departureAt)],
//       });
//     }

//     return {
//       outbound: outboundFlights,
//       return: returnFlights,
//     };
//   }

//   async getFlightById(id: number) {
//     const flight = await this.db.query.flights.findFirst({
//       where: eq(schema.flights.id, id),
//       with: {
//         airline: true,
//         originAirport: {
//           with: {
//             city: {
//               with: {
//                 country: true,
//               },
//             },
//           },
//         },
//         destinationAirport: {
//           with: {
//             city: {
//               with: {
//                 country: true,
//               },
//             },
//           },
//         },
//         flightInventory: {
//           with: {
//             seatClass: true,
//           },
//         },
//       },
//     });

//     if (!flight) {
//       throw new NotFoundException('Flight not found');
//     }

//     return flight;
//   }

//   async bookFlight(bookFlightDto: BookFlightDto, userId: string) {
//     const { flightId, classId, numberOfSeats, seatNumbers } = bookFlightDto;

//     // Check if flight exists and is active
//     const flight = await this.getFlightById(flightId);
//     if (!flight.is_active) {
//       throw new BadRequestException('Flight is not available');
//     }

//     // Check inventory availability
//     const inventory = flight.flightInventory.find(inv => inv.classId === classId);
//     if (!inventory) {
//       throw new BadRequestException('Seat class not available for this flight');
//     }

//     if (inventory.seatsSold + numberOfSeats > inventory.seatsTotal) {
//       throw new BadRequestException('Not enough seats available');
//     }

//     // Calculate total price
//     const totalPrice = flight.flightInventory.price * numberOfSeats;

//     // Create flight booking
//     const [booking] = await this.db.insert(schema.flightBookings).values({
//       flightId,
//       userId,
//       classId,
//       numberOfSeats,
//       price: totalPrice,
//       status: 'CONFIRMED',
//     }).returning();

//     // Add seat assignments if provided
//     if (seatNumbers && seatNumbers.length > 0) {
//       const seatAssignments = seatNumbers.map(seatNumber => ({
//         flightBookingId: booking.id,
//         seatNumber,
//       }));

//       await this.db.insert(schema.flightBookingSeats).values(seatAssignments);
//     }

//     // Update inventory
//     await this.db
//       .update(schema.flightInventory)
//       .set({
//         seatsSold: flight.flightInventory.seatsSold + numberOfSeats,
//       })
//       .where(
//         and(
//           eq(schema.flightInventory.flightId, flightId),
//           eq(schema.flightInventory.classId, classId),
//         ),
//       );

//     return booking;
//   }

//   async getUserBookings(userId: string) {
//     return await this.db.query.flightBookings.findMany({
//       where: eq(schema.flightBookings.userId, userId),
//       with: {
//         flight: {
//           with: {
//             airline: true,
//             originAirport: {
//               with: {
//                 city: {
//                   with: {
//                     country: true,
//                   },
//                 },
//               },
//             },
//             destinationAirport: {
//               with: {
//                 city: {
//                   with: {
//                     country: true,
//                   },
//                 },
//               },
//             },
//           },
//         },
//         seatClass: true,
//         flightBookingSeats: true,
//       },
//       orderBy: [desc(schema.flightBookings.createdAt)],
//     });
//   }

//   async cancelBooking(bookingId: number, userId: string) {
//     const booking = await this.db.query.flightBookings.findFirst({
//       where: and(
//         eq(schema.flightBookings.id, bookingId),
//         eq(schema.flightBookings.userId, userId),
//       ),
//     });

//     if (!booking) {
//       throw new NotFoundException('Booking not found');
//     }

//     if (booking.status === 'CANCELLED') {
//       throw new BadRequestException('Booking is already cancelled');
//     }

//     // Update booking status
//     await this.db
//       .update(schema.flightBookings)
//       .set({ status: 'CANCELLED' })
//       .where(eq(schema.flightBookings.id, bookingId));

//     // Update inventory
//     const inventory = await this.db.query.flightInventory.findFirst({
//       where: and(
//         eq(schema.flightInventory.flightId, booking.flightId),
//         eq(schema.flightInventory.classId, booking.classId),
//       ),
//     });

//     if (inventory) {
//       await this.db
//         .update(schema.flightInventory)
//         .set({
//           seatsSold: flight.flightInventory.seatsSold - booking.numberOfSeats,
//         })
//         .where(
//           and(
//             eq(schema.flightInventory.flightId, booking.flightId),
//             eq(schema.flightInventory.classId, booking.classId),
//           ),
//         );
//     }

//     return { message: 'Booking cancelled successfully' };
//   }
// } 