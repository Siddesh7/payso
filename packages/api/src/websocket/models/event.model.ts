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
