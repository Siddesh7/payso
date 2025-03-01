import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ExecutePaymentDto } from './dto/execute-payment.dto';
import { MerchantService } from '../merchant/merchant.service';
import { JupiterService } from '../jupiter/jupiter.service';
import { PaymentEventType } from '../websocket/models/event.model';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PaymentGateway } from '../websocket/payment/payment.gateway';
import { DataSource } from 'typeorm';

// Common USDC mint address
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private readonly merchantService: MerchantService,
    private readonly jupiterService: JupiterService,
    private readonly paymentGateway: PaymentGateway,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a new payment intent
   */
  async createPayment(createPaymentDto: CreatePaymentDto): Promise<Payment> {
    const merchant = await this.merchantService.getMerchantById(
      createPaymentDto.merchantId,
    );

    const payment = this.paymentRepository.create({
      merchantId: merchant.id,
      amount: createPaymentDto.amount,
      currency: createPaymentDto.currency,
      tokenAmount: 0, // Will be calculated when token is selected
      selectedToken: '', // Will be set when customer selects a token
      destinationWallet: merchant.walletAddress,
      status: PaymentStatus.PENDING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // Emit payment created event
    this.paymentGateway.emitToMerchant(savedPayment.merchantId, {
      type: PaymentEventType.PAYMENT_CREATED,
      paymentId: savedPayment.id,
      merchantId: savedPayment.merchantId,
      data: savedPayment,
      timestamp: new Date(),
    });

    return savedPayment;
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  /**
   * Prepare a payment for execution
   * This calculates the token amount needed based on the selected token
   */
  async preparePayment(
    paymentId: string,
    selectedToken: string,
  ): Promise<{ payment: Payment; quote: any }> {
    const payment = await this.getPaymentById(paymentId);

    if (payment.status !== PaymentStatus.PENDING) {
      throw new Error('Payment is no longer in pending state');
    }

    try {
      // Get quote for token swap (if not USDC)
      let quote;
      if (selectedToken === USDC_MINT) {
        // Direct USDC transfer - no swap needed
        // Convert amount to USDC with 6 decimals
        payment.tokenAmount = payment.amount * 1000000;
        quote = { isDirectTransfer: true };
      } else {
        // Need to swap - get quote from Jupiter
        // We're using ExactOut mode to specify the exact USDC amount we want to receive
        quote = await this.jupiterService.getQuote(
          selectedToken,
          USDC_MINT,
          Math.floor(payment.amount * 1000000), // Convert to USDC decimals (6)
          100, // 1% slippage
          'ExactOut',
        );

        // Calculate input token amount based on quote
        const tokens = await this.jupiterService.getPopularTokens();
        const selectedTokenInfo = tokens.find(
          (t) => t.address === selectedToken,
        );
        const decimals = selectedTokenInfo ? selectedTokenInfo.decimals : 6;

        payment.tokenAmount =
          parseInt(quote.inAmount) / Math.pow(10, decimals - 6);
      }

      // Update payment
      payment.selectedToken = selectedToken;
      const updatedPayment = await this.paymentRepository.save(payment);

      return { payment: updatedPayment, quote };
    } catch (error) {
      this.logger.error(`Failed to prepare payment: ${error.message}`);
      throw new Error('Failed to prepare payment with selected token');
    }
  }

  /**
   * Update payment status after transaction submission
   */
  async updatePaymentStatusAfterSubmission(
    paymentId: string,
    transactionSignature: string,
  ): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId);

    payment.transactionSignature = transactionSignature;
    const updatedPayment = await this.paymentRepository.save(payment);

    // Emit transaction submitted event
    this.paymentGateway.emitToMerchant(updatedPayment.merchantId, {
      type: PaymentEventType.TRANSACTION_SUBMITTED,
      paymentId: updatedPayment.id,
      merchantId: updatedPayment.merchantId,
      data: {
        payment: updatedPayment,
        transactionSignature,
      },
      timestamp: new Date(),
    });

    return updatedPayment;
  }
  /**
   * Execute payment - builds transaction data with special handling for USDC
   */
  async executePayment(
    executePaymentDto: ExecutePaymentDto,
  ): Promise<{ payment: Payment; transactionData: any }> {
    try {
      const { paymentId, selectedToken, customerWallet } = executePaymentDto;
      this.logger.log(
        `Starting payment execution for ${paymentId} with token ${selectedToken}`,
      );

      // Validate wallet address
      try {
        new PublicKey(customerWallet);
      } catch (error) {
        throw new Error('Invalid customer wallet address');
      }

      // Get payment
      const payment = await this.paymentRepository.findOne({
        where: { id: paymentId },
      });

      if (!payment) {
        throw new NotFoundException(`Payment with ID ${paymentId} not found`);
      }

      // Check payment status
      if (payment.status !== PaymentStatus.PENDING) {
        this.logger.error(
          `Payment ${paymentId} is not in pending state: ${payment.status}`,
        );
        throw new Error('Payment is no longer in pending state');
      }

      // Update payment status - but don't execute transaction
      payment.status = PaymentStatus.PROCESSING;
      payment.customerWallet = customerWallet;

      const updatedPayment = await this.paymentRepository.save(payment);
      this.logger.log(`Payment ${paymentId} status updated to PROCESSING`);

      // Build transaction data based on selected token
      let transactionData;

      try {
        // Get merchant's public key
        const merchantPublicKey = new PublicKey(payment.destinationWallet);
        const isDirectUsdcTransfer = selectedToken === USDC_MINT;

        this.logger.log(`Is direct USDC transfer: ${isDirectUsdcTransfer}`);

        if (isDirectUsdcTransfer) {
          // Direct USDC transfer - get the merchant's USDC account
          const usdcMintPublicKey = new PublicKey(USDC_MINT);

          const merchantUsdcAccount = await getAssociatedTokenAddress(
            usdcMintPublicKey,
            merchantPublicKey,
          );

          // For direct USDC transfers, just provide basic information
          // The frontend will handle building the transfer transaction
          transactionData = {
            isDirectUsdcTransfer: true,
            isDirectTransfer: true,
            merchantAddress: payment.destinationWallet,
            destinationTokenAccount: merchantUsdcAccount.toString(),
            amount: payment.tokenAmount,
            tokenMint: USDC_MINT,
          };

          this.logger.log(
            `Direct USDC transfer data prepared for payment ${paymentId} to ${merchantUsdcAccount.toString()}`,
          );
        } else {
          // Need to swap tokens using Jupiter and send directly to merchant
          this.logger.log(`Preparing Jupiter swap for payment ${paymentId}`);

          // First get a quote
          const quote = await this.jupiterService.getQuote(
            selectedToken,
            USDC_MINT,
            Math.floor(payment.amount * 1000000), // Convert to USDC decimals (6)
            100, // 1% slippage
            'ExactOut',
          );

          this.logger.log(`Jupiter quote obtained for payment ${paymentId}`);

          // Get merchant's USDC token account
          const usdcMintPublicKey = new PublicKey(USDC_MINT);
          const merchantUsdcAccount = await getAssociatedTokenAddress(
            usdcMintPublicKey,
            merchantPublicKey,
          );

          // Build the swap transaction with merchant as destination
          const swapTransaction =
            await this.jupiterService.buildSwapTransaction(
              quote,
              customerWallet,
              merchantUsdcAccount.toString(), // This sends directly to merchant's account
            );

          transactionData = {
            isDirectUsdcTransfer: false,
            isDirectTransfer: false,
            swapTransaction,
            quote,
            destinationTokenAccount: merchantUsdcAccount.toString(),
            merchantAddress: payment.destinationWallet,
          };

          this.logger.log(
            `Jupiter swap transaction data prepared for payment ${paymentId}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to prepare transaction data: ${error.message}`,
          error.stack,
        );

        // If anything fails during transaction preparation, reset payment status
        payment.status = PaymentStatus.PENDING;
        await this.paymentRepository.save(payment);

        throw new Error(`Failed to prepare transaction: ${error.message}`);
      }

      // Emit payment updated event
      try {
        this.paymentGateway.emitToMerchant(updatedPayment.merchantId, {
          type: PaymentEventType.PAYMENT_UPDATED,
          paymentId: updatedPayment.id,
          merchantId: updatedPayment.merchantId,
          data: updatedPayment,
          timestamp: new Date(),
        });

        this.paymentGateway.emitToPayment(updatedPayment.id, {
          type: PaymentEventType.PAYMENT_UPDATED,
          paymentId: updatedPayment.id,
          merchantId: updatedPayment.merchantId,
          data: updatedPayment,
          timestamp: new Date(),
        });

        this.logger.log(`Payment updated events emitted for ${paymentId}`);
      } catch (error) {
        this.logger.error(`Failed to emit payment events: ${error.message}`);
        // Continue even if events fail
      }

      this.logger.log(
        `Transaction data preparation completed for payment ${paymentId}`,
      );
      return { payment: updatedPayment, transactionData };
    } catch (error) {
      this.logger.error(
        `Failed to execute payment: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to execute payment: ${error.message}`);
    }
  }

  /**
   * Confirm payment with transaction signature
   * This is called after the frontend has successfully submitted the transaction
   */
  async confirmPayment(
    paymentId: string,
    transactionSignature: string,
  ): Promise<Payment> {
    try {
      this.logger.log(
        `Confirming payment ${paymentId} with signature ${transactionSignature}`,
      );

      // Get payment
      const payment = await this.getPaymentById(paymentId);

      // Check if payment is in processing state
      if (payment.status !== PaymentStatus.PROCESSING) {
        this.logger.warn(
          `Payment ${paymentId} is not in processing state: ${payment.status}`,
        );
        // Still continue as the transaction might be valid
      }

      // Update payment with transaction signature
      payment.transactionSignature = transactionSignature;
      await this.paymentRepository.save(payment);

      // In a production environment, you would verify the transaction on-chain here
      // For now, we'll just mark it as completed

      // Mark payment as completed
      payment.status = PaymentStatus.COMPLETED;
      const completedPayment = await this.paymentRepository.save(payment);

      // Emit payment completed event
      this.paymentGateway.emitToMerchant(completedPayment.merchantId, {
        type: PaymentEventType.PAYMENT_COMPLETED,
        paymentId: completedPayment.id,
        merchantId: completedPayment.merchantId,
        data: completedPayment,
        timestamp: new Date(),
      });

      this.paymentGateway.emitToPayment(completedPayment.id, {
        type: PaymentEventType.PAYMENT_COMPLETED,
        paymentId: completedPayment.id,
        merchantId: completedPayment.merchantId,
        data: completedPayment,
        timestamp: new Date(),
      });

      this.logger.log(`Payment ${paymentId} confirmed and completed`);
      return completedPayment;
    } catch (error) {
      this.logger.error(
        `Failed to confirm payment: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to confirm payment: ${error.message}`);
    }
  }

  /**
   * Complete payment after transaction confirmation
   */
  async completePayment(paymentId: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId);

    payment.status = PaymentStatus.COMPLETED;
    const updatedPayment = await this.paymentRepository.save(payment);

    // Emit payment completed event
    this.paymentGateway.emitToMerchant(updatedPayment.merchantId, {
      type: PaymentEventType.PAYMENT_COMPLETED,
      paymentId: updatedPayment.id,
      merchantId: updatedPayment.merchantId,
      data: updatedPayment,
      timestamp: new Date(),
    });

    return updatedPayment;
  }

  /**
   * Mark payment as failed
   */
  async failPayment(paymentId: string, reason: string): Promise<Payment> {
    const payment = await this.getPaymentById(paymentId);

    payment.status = PaymentStatus.FAILED;
    const updatedPayment = await this.paymentRepository.save(payment);

    // Emit payment failed event
    this.paymentGateway.emitToMerchant(updatedPayment.merchantId, {
      type: PaymentEventType.PAYMENT_FAILED,
      paymentId: updatedPayment.id,
      merchantId: updatedPayment.merchantId,
      data: {
        payment: updatedPayment,
        reason,
      },
      timestamp: new Date(),
    });

    return updatedPayment;
  }

  /**
   * Get payments by merchant ID
   */
  async getPaymentsByMerchantId(merchantId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }
}
