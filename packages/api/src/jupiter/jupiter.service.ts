import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Token } from './models/token.model';
import { JupiterQuote } from './models/quote.model';

@Injectable()
export class JupiterService {
  private readonly logger = new Logger(JupiterService.name);
  private readonly jupiterQuoteApiUrl = 'https://quote-api.jup.ag/v6/quote';
  private readonly jupiterSwapApiUrl = 'https://quote-api.jup.ag/v6/swap';
  private readonly jupiterTokensUrl = 'https://token.jup.ag/all';

  constructor(private configService: ConfigService) {}

  /**
   * Fetch all supported tokens from Jupiter
   */
  async getAllTokens(): Promise<Token[]> {
    try {
      const response = await axios.get(this.jupiterTokensUrl);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch tokens: ${error.message}`);
      throw new Error('Failed to fetch tokens from Jupiter API');
    }
  }

  /**
   * Get popular tokens for payment
   */
  async getPopularTokens(): Promise<Token[]> {
    try {
      const allTokens = await this.getAllTokens();
      // Filter for common tokens
      return allTokens.filter((token) =>
        ['USDC', 'USDT', 'SOL', 'BONK', 'SAMO', 'RAY'].includes(token.symbol),
      );
    } catch (error) {
      this.logger.error(`Failed to fetch popular tokens: ${error.message}`);
      throw new Error('Failed to fetch popular tokens from Jupiter API');
    }
  }

  /**
   * Get quote for swapping tokens
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 100,
    swapMode: string = 'ExactOut',
  ): Promise<JupiterQuote> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        swapMode,
      });

      const response = await axios.get(
        `${this.jupiterQuoteApiUrl}?${params.toString()}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get quote: ${error.message}`);
      throw new Error('Failed to get quote from Jupiter API');
    }
  }

  /**
   * Build swap transaction
   * This will create a transaction that swaps tokens and sends output directly to destination
   */
  async buildSwapTransaction(
    quoteResponse: JupiterQuote,
    userPublicKey: string,
    destinationTokenAccount: string,
  ): Promise<string> {
    try {
      this.logger.log(
        `Building swap transaction with destination account: ${destinationTokenAccount}`,
      );

      const response = await axios.post(this.jupiterSwapApiUrl, {
        quoteResponse,
        userPublicKey,
        destinationTokenAccount, // This will send output directly to this account
        wrapAndUnwrapSol: true,
        useSharedAccounts: true,
        skipUserAccountsRpcCalls: false,
        computeUnitPriceMicroLamports: 2000, // Higher priority for faster execution
        asLegacyTransaction: false,
        feeConfig: {
          feeBps: 0, // No additional fees
        },
      });

      this.logger.log(
        `Swap transaction built successfully for user: ${userPublicKey}`,
      );
      return response.data.swapTransaction;
    } catch (error) {
      this.logger.error(`Failed to build swap transaction: ${error.message}`);
      throw new Error('Failed to build swap transaction from Jupiter API');
    }
  }
}
