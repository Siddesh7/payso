import { IsNotEmpty, IsString } from 'class-validator';

export class ExecutePaymentDto {
  @IsNotEmpty()
  @IsString()
  paymentId: string;

  @IsNotEmpty()
  @IsString()
  selectedToken: string; // Token mint address

  @IsNotEmpty()
  @IsString()
  customerWallet: string; // Customer wallet address
}
