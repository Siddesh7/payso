import { Injectable } from '@nestjs/common';
import { MerchantService } from '../merchant/merchant.service';

@Injectable()
export class AuthService {
  constructor(private readonly merchantService: MerchantService) {}

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    const merchant = await this.merchantService.getMerchantByApiKey(apiKey);
    return !!merchant;
  }

  /**
   * Get merchant ID from API key
   */
  async getMerchantIdFromApiKey(apiKey: string): Promise<string | null> {
    const merchant = await this.merchantService.getMerchantByApiKey(apiKey);
    return merchant ? merchant.id : null;
  }
}
