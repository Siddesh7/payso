import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  HttpStatus,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { Merchant } from './entities/merchant.entity';
// In a real app, you would have an AuthGuard
// import { AuthGuard } from '../auth/auth.guard';

@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createMerchantDto: CreateMerchantDto,
  ): Promise<Merchant> {
    return this.merchantService.createMerchant(createMerchantDto);
  }

  @Get(':id')
  // @UseGuards(AuthGuard)
  async findOne(@Param('id') id: string): Promise<Merchant> {
    return this.merchantService.getMerchantById(id);
  }

  @Put(':id/wallet')
  // @UseGuards(AuthGuard)
  async updateWallet(
    @Param('id') id: string,
    @Body('walletAddress') walletAddress: string,
  ): Promise<Merchant> {
    return this.merchantService.updateWalletAddress(id, walletAddress);
  }

  @Post(':id/regenerate-api-key')
  // @UseGuards(AuthGuard)
  async regenerateApiKey(@Param('id') id: string): Promise<{ apiKey: string }> {
    return this.merchantService.regenerateApiKey(id);
  }
}
