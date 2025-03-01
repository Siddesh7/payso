// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MerchantModule } from './merchant/merchant.module';
import { PaymentModule } from './payment/payment.module';
import { WebsocketModule } from './websocket/websocket.module';
import { JupiterModule } from './jupiter/jupiter.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // app.module.ts
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', '172.18.0.2'), // Replace with actual IP
        port: parseInt(configService.get('DB_PORT', '5432')),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'cryptopayhub'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize:
          configService.get('NODE_ENV', 'development') !== 'production',
        logging: configService.get('NODE_ENV', 'development') !== 'production',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    MerchantModule,
    PaymentModule,
    WebsocketModule,
    JupiterModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
