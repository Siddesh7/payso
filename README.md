# Payso API

A NestJS-based backend service for processing crypto payments on Solana.

## Overview

The Payso API provides the backend infrastructure for the Payso payment platform, enabling merchants to:

- Create and manage payment intents
- Process cryptocurrency payments on Solana
- Receive real-time payment status updates
- Support multiple tokens via Jupiter swaps
- Validate API keys and authenticate merchants

## Project Structure

This project is part of a NX monorepo workspace:

```
/
├── apps/
│   ├── api/             # This NestJS API service
│
├── libs/
│   ├── sdk/             # TypeScript SDK for client integrations
│   └── ...              # Other libraries
```

## Key Features

- **RESTful API**: Comprehensive endpoints for payment processing
- **WebSocket Support**: Real-time payment status updates
- **Jupiter Integration**: Swap between any Solana tokens
- **Authentication**: API key-based merchant authentication
- **Solana Integration**: Native support for Solana blockchain

## Tech Stack

- **NestJS**: Server-side framework
- **TypeORM**: Database ORM
- **Socket.io**: WebSocket implementation
- **Solana Web3.js**: Solana blockchain integration
- **Jupiter SDK**: Token swap integration

## Getting Started

### Prerequisites

- Node.js 16+
- PostgreSQL or compatible database
- NX CLI
- Solana validator (local or remote)

### Installation

```bash
# Install NX CLI globally if not already installed
npm install -g nx

# Install dependencies
npm install

# Setup environment
cp apps/api/.env.example apps/api/.env
```

Configure your environment variables in the `.env` file.

### Database Setup

```bash
# Run migrations
nx run api:migration:run
```

### Running the API

```bash
# Development mode
nx serve api

# Production build
nx build api
```

The API will be available at http://localhost:3000 by default.

## Core Modules

### Payment Module

Handles the entire payment lifecycle from creation to completion.

Key components:

- `PaymentController`: API endpoints for payment operations
- `PaymentService`: Business logic for payment processing
- `PaymentGateway`: WebSocket gateway for real-time updates

### Authentication Module

Manages merchant authentication and API key validation.

Key components:

- `AuthController`: API endpoints for authentication
- `AuthService`: API key validation services
- `AuthGuard`: NestJS guard for route protection

### Merchant Module

Handles merchant registration and management.

Key components:

- `MerchantController`: API endpoints for merchant operations
- `MerchantService`: Business logic for merchant management

## API Endpoints

### Authentication

- `POST /auth/validate-key` - Validate API key

### Payments

- `POST /payments` - Create payment intent
- `GET /payments/:id` - Get payment by ID
- `POST /payments/:id/prepare` - Prepare payment with selected token
- `POST /payments/:id/execute` - Execute payment
- `POST /payments/:id/confirm` - Confirm payment
- `GET /payments/merchant/:merchantId` - Get payments by merchant
- `GET /payments/tokens/popular` - Get popular tokens

### Merchants

- `POST /merchants` - Create merchant
- `GET /merchants/:id` - Get merchant by ID
- `GET /merchants?walletAddress=X` - Get merchants by wallet
- `PUT /merchants/:id/wallet` - Update wallet address
- `POST /merchants/:id/regenerate-api-key` - Regenerate API key

## WebSocket Events

The API uses Socket.io for real-time communication:

### Client to Server

- `subscribe_merchant` - Subscribe to all events for a merchant
- `subscribe_payment` - Subscribe to events for a specific payment
- `unsubscribe_merchant` - Unsubscribe from merchant events
- `unsubscribe_payment` - Unsubscribe from payment events

### Server to Client

- `payment_event` - Emitted when a payment status changes

## TypeScript SDK

A TypeScript SDK is available in the `libs/sdk` directory to simplify client integration. The SDK provides a high-level interface to interact with the API and includes a payment widget for easy frontend integration.

To use the SDK in other projects:

```bash
nx build sdk
```

Then publish the SDK to npm or use it locally.

See the [SDK README](../../libs/sdk/README.md) for detailed documentation on how to use it in your projects.

## Deployment

The API can be deployed as a standalone service or as part of the entire monorepo:

```bash
# Build for production
nx build api --production

# The built application will be in the dist/apps/api directory
```

## License

MIT
