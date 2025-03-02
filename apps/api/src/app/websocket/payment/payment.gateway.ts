import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PaymentEvent } from '../models/event.model';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class PaymentGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PaymentGateway.name);

  @WebSocketServer()
  server: Server;

  // Map to store client connections by merchant ID
  private merchantClients: Map<string, Set<string>> = new Map();

  // Map to store client connections by payment ID
  private paymentClients: Map<string, Set<string>> = new Map();

  // Map to store client ID to socket instance
  private clients: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clients.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove client from all tracking maps
    this.clients.delete(client.id);

    // Remove from merchant clients
    for (const [merchantId, clients] of this.merchantClients.entries()) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.merchantClients.delete(merchantId);
        }
      }
    }

    // Remove from payment clients
    for (const [paymentId, clients] of this.paymentClients.entries()) {
      if (clients.has(client.id)) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.paymentClients.delete(paymentId);
        }
      }
    }
  }

  @SubscribeMessage('subscribe_merchant')
  handleSubscribeMerchant(client: Socket, merchantId: string) {
    this.logger.log(`Client ${client.id} subscribed to merchant ${merchantId}`);

    if (!this.merchantClients.has(merchantId)) {
      this.merchantClients.set(merchantId, new Set());
    }

    this.merchantClients.get(merchantId)?.add(client.id);
    return { status: 'subscribed', merchantId };
  }

  @SubscribeMessage('subscribe_payment')
  handleSubscribePayment(client: Socket, paymentId: string) {
    this.logger.log(`Client ${client.id} subscribed to payment ${paymentId}`);

    if (!this.paymentClients.has(paymentId)) {
      this.paymentClients.set(paymentId, new Set());
    }

    this.paymentClients.get(paymentId)?.add(client.id);
    return { status: 'subscribed', paymentId };
  }

  @SubscribeMessage('unsubscribe_merchant')
  handleUnsubscribeMerchant(client: Socket, merchantId: string) {
    this.logger.log(
      `Client ${client.id} unsubscribed from merchant ${merchantId}`,
    );

    if (this.merchantClients.has(merchantId)) {
      this.merchantClients.get(merchantId)?.delete(client.id);

      if ((this.merchantClients.get(merchantId)?.size ?? 0) === 0) {
        this.merchantClients.delete(merchantId);
      }
    }

    return { status: 'unsubscribed', merchantId };
  }

  @SubscribeMessage('unsubscribe_payment')
  handleUnsubscribePayment(client: Socket, paymentId: string) {
    this.logger.log(
      `Client ${client.id} unsubscribed from payment ${paymentId}`,
    );

    if (this.paymentClients.has(paymentId)) {
      this.paymentClients.get(paymentId)?.delete(client.id);

      if ((this.paymentClients.get(paymentId)?.size ?? 0) === 0) {
        this.paymentClients.delete(paymentId);
      }
    }

    return { status: 'unsubscribed', paymentId };
  }

  /**
   * Emit an event to all clients subscribed to a merchant
   */
  emitToMerchant(merchantId: string, event: PaymentEvent) {
    this.logger.log(`Emitting event to merchant ${merchantId}: ${event.type}`);

    if (this.merchantClients.has(merchantId)) {
      for (const clientId of this.merchantClients.get(merchantId) ?? []) {
        const clientSocket = this.clients.get(clientId);
        if (clientSocket) {
          clientSocket.emit('payment_event', event);
        }
      }
    }
  }

  /**
   * Emit an event to all clients subscribed to a payment
   */
  emitToPayment(paymentId: string, event: PaymentEvent) {
    this.logger.log(`Emitting event to payment ${paymentId}: ${event.type}`);

    if (this.paymentClients.has(paymentId)) {
      for (const clientId of this.paymentClients.get(paymentId) ?? []) {
        const clientSocket = this.clients.get(clientId);
        if (clientSocket) {
          clientSocket.emit('payment_event', event);
        }
      }
    }
  }
}
