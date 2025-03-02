export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface Payment {
  id: string;
  merchantId: string;
  amount: number;
  currency: string;
  tokenAmount: number;
  selectedToken: string;
  destinationWallet: string;
  customerWallet?: string;
  status: PaymentStatus;
  transactionSignature?: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface Merchant {
  id: string;
  name: string;
  walletAddress: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}
export interface Token {
  symbol: string;
  name: string;
  address: string; // Mint address
  decimals: number;
  logoURI?: string;
}

export enum PaymentEventType {
  PAYMENT_CREATED = 'payment_created',
  PAYMENT_UPDATED = 'payment_updated',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  TRANSACTION_SUBMITTED = 'transaction_submitted',
  TRANSACTION_CONFIRMED = 'transaction_confirmed',
}

export interface PaymentEvent {
  type: PaymentEventType;
  paymentId: string;
  merchantId: string;
  data: any;
  timestamp: Date;
}

export interface CreatePaymentRequest {
  amount: number;
  currency: string;
  customerEmail?: string;
  metadata?: string;
}

export interface CreatePaymentResponse extends Payment {}

export interface PreparePaymentRequest {
  paymentId: string;
  selectedToken: string;
}

export interface PreparePaymentResponse {
  payment: Payment;
  quote: any;
}

export interface ExecutePaymentRequest {
  paymentId: string;
  selectedToken: string;
  customerWallet: string;
}

export interface ExecutePaymentResponse {
  payment: Payment;
  transactionData: any;
}

export interface ConfirmPaymentRequest {
  paymentId: string;
  transactionSignature: string;
}

export interface ConfirmPaymentResponse extends Payment {}
