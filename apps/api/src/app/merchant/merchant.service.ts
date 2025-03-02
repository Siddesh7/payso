import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Merchant } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private merchantRepository: Repository<Merchant>
  ) {}

  /**
   * Create a new merchant
   */
  async createMerchant(
    createMerchantDto: CreateMerchantDto
  ): Promise<Merchant> {
    try {
      new PublicKey(createMerchantDto.walletAddress);

      const merchant = this.merchantRepository.create({
        name: createMerchantDto.name,
        walletAddress: createMerchantDto.walletAddress,
        apiKey: this.generateApiKey(),
      });

      return this.merchantRepository.save(merchant);
    } catch (error) {
      throw new Error('Invalid wallet address');
    }
  }

  /**
   * Get merchant by ID
   */
  async getMerchantById(id: string): Promise<Merchant> {
    const merchant = await this.merchantRepository.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return merchant;
  }
  /**
   * Get merchants by wallet address
   */
  async getMerchantsByWalletAddress(
    walletAddress: string
  ): Promise<Merchant[]> {
    try {
      // Find all merchants with the specified wallet address
      const merchants = await this.merchantRepository.find({
        where: { walletAddress },
      });

      return merchants;
    } catch (error) {
      throw new Error('Invalid wallet address');
    }
  }
  /**
   * Get merchant by API key
   */
  async getMerchantByApiKey(apiKey: string): Promise<Merchant | null> {
    return this.merchantRepository.findOne({ where: { apiKey } });
  }

  /**
   * Update merchant wallet address
   */
  async updateWalletAddress(
    id: string,
    walletAddress: string
  ): Promise<Merchant> {
    try {
      // Validate Solana wallet address
      new PublicKey(walletAddress);

      const merchant = await this.getMerchantById(id);
      merchant.walletAddress = walletAddress;

      return this.merchantRepository.save(merchant);
    } catch (error) {
      throw new Error('Invalid wallet address');
    }
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(id: string): Promise<{ apiKey: string }> {
    const merchant = await this.getMerchantById(id);
    merchant.apiKey = this.generateApiKey();

    await this.merchantRepository.save(merchant);
    return { apiKey: merchant.apiKey };
  }

  /**
   * Generate a random API key
   */
  private generateApiKey(): string {
    return `cpay_${uuidv4().replace(/-/g, '')}`;
  }
}
