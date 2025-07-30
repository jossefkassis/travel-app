import { SetMetadata } from '@nestjs/common';

export enum Permission {
  // Read permissions
  CountryRead = 'country:read',
  CityRead = 'city:read',
  TripRead = 'trip:read',
  AirportRead = 'airport:read',
  ReviewRead = 'review:read',
  FavouriteRead = 'favourite:read',
  HotelRead = 'hotel:read',
  HotelRoomTypeRead = 'hotel_room_type:read',

  // Create permissions
  ReviewCreate = 'review:create',
  FavouriteCreate = 'favourite:create',
  OrderCreate = 'order:create',
  RoomReservationCreate = 'room_reservation:create',

  // Own-specific read/manage permissions
  WalletViewOwn = 'wallet:view:own',
  ProfileManageOwn = 'profile:manage:own',
  TripReadOwn = 'trip:read:own', // Guide specific
  TripParticipantsReadOwn = 'trip:participants:read:own', // Guide specific
  ChatReadOwnTrips = 'chat:read:own_trips', // Guide specific
  GuideProfileManageOwn = 'guide_profile:manage:own', // Guide specific
  RoomReservationReadOwn = 'room_reservation:read:own',

  // Booking permissions
  FlightBook = 'flight:book',
  TripBook = 'trip:book',

  // Management permissions (typically for Admins)
  CountryManage = 'country:manage',
  CityManage = 'city:manage',
  TripManage = 'trip:manage',
  AirportManage = 'airport:manage',
  HotelManage = 'hotel:manage',
  HotelRoomTypeManage = 'hotel_room_type:manage',
  RoomReservationManageAll = 'room_reservation:manage:all',
  RoomInventoryManage = 'room_inventory:manage',

  UserReadAll = 'user:read:all',
  UserManage = 'user:manage',
  RoleManage = 'role:manage',
  PermissionManage = 'permission:manage',
  PaymentViewAll = 'payment:view:all',
  SystemSettingsManage = 'system:settings:manage',
  TripUpdateOwn = 'trip:update:own', // Guide specific
}

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

export const SetPermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
