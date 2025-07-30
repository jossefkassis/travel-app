import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database.module';
import { StorageModule } from './storage/storage.module';
import { CountryModule } from './country/country.module';
import { CityModule } from './city/city.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { GuidesModule } from './guides/guides.module';
import { HotelsModule } from './hotels/hotels.module';
import { AttractionsModule } from './attractions/attractions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    StorageModule,
    UsersModule,
    CountryModule,
    CityModule,
    RolesModule,
    PermissionsModule,
    GuidesModule,
    HotelsModule,
    AttractionsModule,
  ],
})
export class AppModule {}
