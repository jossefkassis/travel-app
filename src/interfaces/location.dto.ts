import { IsNumber } from 'class-validator';

export class LatLon {
  @IsNumber()
  lat: number;

  @IsNumber()
  lon: number;
}
