import { Module } from '@nestjs/common';
import { PaymentGateway } from './payment/payment.gateway';

@Module({
  providers: [PaymentGateway],
  exports: [PaymentGateway],
})
export class WebsocketModule {}
