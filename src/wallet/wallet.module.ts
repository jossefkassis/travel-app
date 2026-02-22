import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database.module';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletAdminController } from './wallet.admin.controller';

@Module({
  imports: [DatabaseModule],
  providers: [WalletService],
  controllers: [WalletController, WalletAdminController],
  exports: [WalletService],
})
export class WalletModule {}
