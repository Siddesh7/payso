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
  Query,
} from '@nestjs/common';
import { MerchantService } from './merchant.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { Merchant } from './entities/merchant.entity';

@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createMerchantDto: CreateMerchantDto
  ): Promise<Merchant> {
    return this.merchantService.createMerchant(createMerchantDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Merchant> {
    return this.merchantService.getMerchantById(id);
  }

  @Get()
  async getByWalletAddress(
    @Query('walletAddress') walletAddress: string
  ): Promise<Merchant[]> {
    return this.merchantService.getMerchantsByWalletAddress(walletAddress);
  }

  @Put(':id/wallet')
  async updateWallet(
    @Param('id') id: string,
    @Body('walletAddress') walletAddress: string
  ): Promise<Merchant> {
    return this.merchantService.updateWalletAddress(id, walletAddress);
  }

  @Post(':id/regenerate-api-key')
  async regenerateApiKey(@Param('id') id: string): Promise<{ apiKey: string }> {
    return this.merchantService.regenerateApiKey(id);
  }
}
