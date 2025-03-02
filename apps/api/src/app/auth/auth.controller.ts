import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('validate-key')
  @HttpCode(HttpStatus.OK)
  async validateKey(
    @Body('apiKey') apiKey: string,
  ): Promise<{ valid: boolean; merchantId?: string | null }> {
    const isValid = await this.authService.validateApiKey(apiKey);
    if (isValid) {
      const merchantId = await this.authService.getMerchantIdFromApiKey(apiKey);
      return { valid: true, merchantId };
    }
    return { valid: false };
  }
}
