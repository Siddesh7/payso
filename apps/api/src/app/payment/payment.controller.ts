import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ExecutePaymentDto } from './dto/execute-payment.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { MerchantService } from '../merchant/merchant.service';
import { JupiterService } from '../jupiter/jupiter.service';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly merchantService: MerchantService,
    private readonly jupiterService: JupiterService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @Headers('x-api-key') apiKey: string,
  ): Promise<Payment> {
    this.logger.log(
      `Create payment request received: ${JSON.stringify(createPaymentDto)}`,
    );

    // Validate API key
    const merchant = await this.merchantService.getMerchantByApiKey(apiKey);
    if (!merchant) {
      this.logger.error(`Invalid API key: ${apiKey}`);
      throw new UnauthorizedException('Invalid API key');
    }

    // Override merchantId from API key
    createPaymentDto.merchantId = merchant.id;
    this.logger.log(`Creating payment for merchant ${merchant.id}`);

    const payment = await this.paymentService.createPayment(createPaymentDto);
    this.logger.log(`Payment created successfully: ${payment.id}`);

    return payment;
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Payment> {
    this.logger.log(`Get payment request: ${id}`);
    const payment = await this.paymentService.getPaymentById(id);
    this.logger.log(`Payment retrieved: ${id}, status: ${payment.status}`);
    return payment;
  }

  @Post(':id/prepare')
  async prepare(
    @Param('id') id: string,
    @Body('selectedToken') selectedToken: string,
  ): Promise<{ payment: Payment; quote: any }> {
    this.logger.log(`Prepare payment request: ${id}, token: ${selectedToken}`);
    const result = await this.paymentService.preparePayment(id, selectedToken);
    this.logger.log(`Payment prepared: ${id}`);
    return result;
  }

  @Post(':id/execute')
  async execute(
    @Param('id') id: string,
    @Body() executePaymentDto: ExecutePaymentDto,
  ): Promise<{ payment: Payment; transactionData: any }> {
    try {
      // Log the incoming request
      this.logger.log(`Execute payment request for ID: ${id}`);

      // Make sure the payment ID in the URL matches the one in the DTO
      executePaymentDto.paymentId = id;

      // Call the service to build transaction data
      const result =
        await this.paymentService.executePayment(executePaymentDto);

      // Log successful execution
      this.logger.log(`Transaction data built successfully: ${id}`);

      return result;
    } catch (error) {
      // Log the error
      this.logger.error(
        `Failed to execute payment: ${error.message}`,
        error.stack,
      );

      // Re-throw the error to be handled by the exception filter
      throw error;
    }
  }

  @Post(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body('transactionSignature') transactionSignature: string,
  ): Promise<Payment> {
    this.logger.log(
      `Confirm payment request: ${id}, signature: ${transactionSignature}`,
    );

    try {
      // Confirm the payment with the transaction signature
      const payment = await this.paymentService.confirmPayment(
        id,
        transactionSignature,
      );
      this.logger.log(`Payment confirmed: ${id}`);

      return payment;
    } catch (error) {
      this.logger.error(
        `Failed to confirm payment: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Get('merchant/:merchantId')
  async findByMerchant(
    @Param('merchantId') merchantId: string,
    @Headers('x-api-key') apiKey: string,
  ): Promise<Payment[]> {
    this.logger.log(`Get payments for merchant: ${merchantId}`);

    // Validate API key
    const merchant = await this.merchantService.getMerchantByApiKey(apiKey);
    if (!merchant || merchant.id !== merchantId) {
      this.logger.error(`Invalid API key for merchant: ${merchantId}`);
      throw new UnauthorizedException('Invalid API key');
    }

    const payments =
      await this.paymentService.getPaymentsByMerchantId(merchantId);
    this.logger.log(
      `Retrieved ${payments.length} payments for merchant: ${merchantId}`,
    );

    return payments;
  }

  @Get('tokens/popular')
  async getPopularTokens(): Promise<any[]> {
    this.logger.log('Get popular tokens request');
    const tokens = await this.jupiterService.getPopularTokens();
    this.logger.log(`Retrieved ${tokens.length} popular tokens`);
    return tokens;
  }
}
