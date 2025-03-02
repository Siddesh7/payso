export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class Payment {
  id: string;
  merchantId: string;
  amount: number;
  currency: string; // USD, EUR, etc.
  tokenAmount: number;
  selectedToken: string; // Token mint address
  destinationWallet: string; // Merchant wallet address
  customerWallet?: string; // Customer wallet address if known
  status: PaymentStatus;
  transactionSignature?: string;
  createdAt: Date;
  updatedAt: Date;
}
