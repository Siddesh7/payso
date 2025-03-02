# Payso SDK

The Payso SDK enables businesses to accept crypto payments on Solana with a simple and customizable payment flow.

## Features

- Simple integration with your web application
- Support for multiple tokens on Solana
- Real-time payment status updates via WebSockets
- Customizable UI to match your brand
- Comprehensive payment lifecycle management

## Installation

```bash
npm install @payso/sdk
```

## Quick Start

```javascript
import { PaymentWidget } from '@payso/sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';

// Initialize the payment widget
const paymentWidget = new PaymentWidget({
  apiKey: 'YOUR_API_KEY',
  amount: 10.99,
  currency: 'USD',
  theme: {
    primaryColor: '#6C5CE7',
  },
  onPaymentCompleted: (payment) => {
    console.log('Payment completed!', payment);
  },
});

// In your React component
function PaymentButton() {
  const { wallet } = useWallet();
  const connection = new Connection('https://api.mainnet-beta.solana.com');

  const handlePayment = () => {
    const container = document.getElementById('payment-container');
    paymentWidget.mount(container, wallet, connection);
  };

  return (
    <div>
      <button onClick={handlePayment}>Pay with Crypto</button>
      <div id="payment-container"></div>
    </div>
  );
}
```

## Core Components

### PaysoClient

The `PaysoClient` class is responsible for API communication with the Payso backend.

```javascript
import { PaysoClient } from '@payso/sdk';

const client = new PaysoClient(
  'YOUR_API_KEY',
  'https://api.payso.com', // Optional API URL
  'https://api.payso.com' // Optional WebSocket URL
);

// Create a payment
const payment = await client.createPayment({
  amount: 19.99,
  currency: 'USD',
  customerEmail: 'customer@example.com',
  metadata: JSON.stringify({ orderId: '123' }),
});

// Get payment details
const paymentDetails = await client.getPayment(payment.id);

// Subscribe to payment events
client.subscribeToPaymentEvents(payment.id, (event) => {
  console.log('Payment event received:', event);
});
```

### PaymentWidget

The `PaymentWidget` class provides a complete payment UI that guides users through the payment process.

```javascript
import { PaymentWidget } from '@payso/sdk';

const widget = new PaymentWidget({
  apiKey: 'YOUR_API_KEY',
  amount: 25.0,
  currency: 'USD',
  customerEmail: 'customer@example.com',
  metadata: JSON.stringify({ productId: '123' }),

  // Event handlers
  onPaymentCreated: (payment) => {
    console.log('Payment created:', payment);
  },
  onPaymentCompleted: (payment) => {
    console.log('Payment completed:', payment);
  },
  onPaymentFailed: (payment, reason) => {
    console.error('Payment failed:', reason);
  },
  onClose: () => {
    console.log('Payment widget closed');
  },

  // Customize theme
  theme: {
    primaryColor: '#6C5CE7',
    secondaryColor: '#0984E3',
    textColor: '#2D3436',
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
  },
});

// Mount to DOM element
widget.mount(
  document.getElementById('payment-container'),
  walletAdapter,
  solanaConnection
);

// Unmount the widget
widget.unmount();
```

## Models

The SDK exports the following TypeScript interfaces and enums:

### Payment Status

```typescript
enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
```

### Payment

```typescript
interface Payment {
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
```

### Payment Events

```typescript
enum PaymentEventType {
  PAYMENT_CREATED = 'payment_created',
  PAYMENT_UPDATED = 'payment_updated',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  TRANSACTION_SUBMITTED = 'transaction_submitted',
  TRANSACTION_CONFIRMED = 'transaction_confirmed',
}

interface PaymentEvent {
  type: PaymentEventType;
  paymentId: string;
  merchantId: string;
  data: any;
  timestamp: Date;
}
```

## Payment Flow

1. **Create payment** - Merchant creates a payment with amount and currency.
2. **Select token** - Customer selects which token to pay with (USDC, SOL, etc.).
3. **Prepare payment** - SDK prepares the payment with the selected token.
4. **Execute payment** - SDK gets transaction data based on customer wallet.
5. **Sign & send transaction** - Customer signs and sends the transaction.
6. **Confirm payment** - SDK confirms the transaction with the backend.
7. **Payment completed** - Payment is marked as completed.

## Advanced Usage

### Custom Styling

```javascript
const widget = new PaymentWidget({
  // ... other options
  theme: {
    primaryColor: '#FF6B6B', // Main action color
    secondaryColor: '#4ECDC4', // Secondary action color
    textColor: '#2D3436', // Text color
    backgroundColor: '#F7F9FC', // Background color
    borderRadius: '16px', // Border radius
  },
});
```

### Direct API Usage

For more control, you can use the PaysoClient directly:

```javascript
import { PaysoClient, PaymentStatus } from '@payso/sdk';

const client = new PaysoClient('YOUR_API_KEY');

// Get all payments for your merchant account
const payments = await client.getPayments();

// Filter completed payments
const completedPayments = payments.filter(
  (p) => p.status === PaymentStatus.COMPLETED
);

// Get available tokens
const tokens = await client.getPopularTokens();
```

### Custom Payment Flow

You can build your own UI and just use the PaysoClient for API calls:

```javascript
import { PaysoClient } from '@payso/sdk';

const client = new PaysoClient('YOUR_API_KEY');

// 1. Create payment
const payment = await client.createPayment({
  amount: 10.99,
  currency: 'USD',
});

// 2. Prepare with selected token
const prepared = await client.preparePayment({
  paymentId: payment.id,
  selectedToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint address
});

// 3. Execute with customer wallet
const executed = await client.executePayment({
  paymentId: payment.id,
  selectedToken: prepared.payment.selectedToken,
  customerWallet: 'CUSTOMER_WALLET_ADDRESS',
});

// 4. Use transaction data to create and send transaction
// ... (custom transaction handling code)

// 5. Confirm the payment with transaction signature
const confirmed = await client.confirmPayment({
  paymentId: payment.id,
  transactionSignature: 'TRANSACTION_SIGNATURE',
});
```

## Webhook Integration

Payso can send webhook notifications for payment events. Configure webhooks in your Payso merchant dashboard.

## Error Handling

The SDK throws errors for various issues. Always use try/catch blocks:

```javascript
try {
  const payment = await client.createPayment({
    amount: 10.99,
    currency: 'USD',
  });
} catch (error) {
  console.error('Failed to create payment:', error.message);
}
```

## Requirements

- Node.js 14+
- Modern browser with ES6 support
- Solana wallet adapter

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 80+

## License

MIT
