import axios, { AxiosInstance } from "axios";
import { io, Socket } from "socket.io-client";
import {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PreparePaymentRequest,
  PreparePaymentResponse,
  ExecutePaymentRequest,
  ExecutePaymentResponse,
  ConfirmPaymentRequest,
  ConfirmPaymentResponse,
  Payment,
  PaymentEvent,
  Token,
} from "./models";

export class PaysoClient {
  private apiClient: AxiosInstance;
  private socket: Socket | null = null;
  private apiKey: string;
  private apiUrl: string;
  private socketUrl: string;
  private merchantId: string | null = null;
  private isValidatingApiKey: boolean = false;
  private apiKeyValidated: boolean = false;

  constructor(
    apiKey: string,
    apiUrl: string = "http://localhost:3000",
    socketUrl: string = "http://localhost:3000"
  ) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.socketUrl = socketUrl;

    this.apiClient = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
    });

    // We'll validate the API key on demand instead of in constructor
  }

  /**
   * Validate API key and get merchant ID
   */
  public async validateApiKey(): Promise<boolean> {
    // Prevent concurrent validation calls
    if (this.isValidatingApiKey) {
      // Wait until the current validation finishes
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isValidatingApiKey) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
      });
      return this.apiKeyValidated;
    }

    // If already validated, return immediately
    if (this.apiKeyValidated && this.merchantId) {
      return true;
    }

    try {
      this.isValidatingApiKey = true;
      const response = await this.apiClient.post("/auth/validate-key", {
        apiKey: this.apiKey,
      });

      if (response.data.valid) {
        this.merchantId = response.data.merchantId;
        this.apiKeyValidated = true;
        return true;
      } else {
        throw new Error("Invalid API key");
      }
    } catch (error) {
      console.error("Failed to validate API key:", error);
      this.apiKeyValidated = false;
      throw new Error("Failed to validate API key");
    } finally {
      this.isValidatingApiKey = false;
    }
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (!this.merchantId) {
      console.warn(
        "[PaysoClient] Merchant ID not available. Make sure API key is valid."
      );
      return;
    }

    if (this.socket && this.socket.connected) {
      console.log("[PaysoClient] Socket already connected");
      return;
    }

    console.log(`[PaysoClient] Connecting to WebSocket at ${this.socketUrl}`);
    this.socket = io(this.socketUrl);

    this.socket.on("connect", () => {
      console.log("[PaysoClient] Connected to WebSocket server");

      // Subscribe to merchant events
      if (this.socket) {
        console.log(
          `[PaysoClient] Subscribing to merchant events for ${this.merchantId}`
        );
        this.socket.emit("subscribe_merchant", this.merchantId);
      }
    });

    this.socket.on("disconnect", () => {
      console.log("[PaysoClient] Disconnected from WebSocket server");
    });

    this.socket.on("connect_error", (error) => {
      console.error("[PaysoClient] Socket connection error:", error);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Subscribe to payment events
   */
  public subscribeToPaymentEvents(
    paymentId: string,
    callback: (event: PaymentEvent) => void
  ): void {
    if (!this.socket || !this.socket.connected) {
      this.connect();
    }

    this.socket?.emit("subscribe_payment", paymentId);

    // Remove any existing listeners to prevent duplicates
    this.socket?.off("payment_event");

    this.socket?.on("payment_event", (event: PaymentEvent) => {
      console.log("[PaysoClient] Payment event received:", event);
      if (event.paymentId === paymentId) {
        callback(event);
      }
    });
  }

  /**
   * Subscribe to merchant events
   */
  public subscribeToMerchantEvents(
    callback: (event: PaymentEvent) => void
  ): void {
    if (!this.socket || !this.socket.connected) {
      this.connect();
    }

    // Remove any existing listeners to prevent duplicates
    this.socket?.off("payment_event");

    this.socket?.on("payment_event", (event: PaymentEvent) => {
      console.log("[PaysoClient] Merchant event received:", event);
      if (event.merchantId === this.merchantId) {
        callback(event);
      }
    });
  }

  /**
   * Create a new payment
   */
  public async createPayment(
    request: CreatePaymentRequest
  ): Promise<CreatePaymentResponse> {
    try {
      // Make sure API key is validated first
      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      console.log("[PaysoClient] Creating payment:", request);
      const response = await this.apiClient.post("/payments", request);
      console.log("[PaysoClient] Payment created:", response.data);
      return response.data;
    } catch (error) {
      console.error("[PaysoClient] Failed to create payment:", error);
      throw new Error("Failed to create payment");
    }
  }

  /**
   * Get payment by ID
   */
  public async getPayment(paymentId: string): Promise<Payment> {
    try {
      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      console.log(`[PaysoClient] Getting payment: ${paymentId}`);
      const response = await this.apiClient.get(`/payments/${paymentId}`);
      console.log(`[PaysoClient] Payment retrieved:`, response.data);
      return response.data;
    } catch (error) {
      console.error("[PaysoClient] Failed to get payment:", error);
      throw new Error("Failed to get payment");
    }
  }

  /**
   * Get all payments for merchant
   */
  public async getPayments(): Promise<Payment[]> {
    try {
      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      if (!this.merchantId) {
        throw new Error(
          "Merchant ID not available. Make sure API key is valid."
        );
      }

      console.log(
        `[PaysoClient] Getting payments for merchant: ${this.merchantId}`
      );
      const response = await this.apiClient.get(
        `/payments/merchant/${this.merchantId}`
      );
      console.log(`[PaysoClient] Retrieved ${response.data.length} payments`);
      return response.data;
    } catch (error) {
      console.error("[PaysoClient] Failed to get payments:", error);
      throw new Error("Failed to get payments");
    }
  }

  /**
   * Prepare payment with selected token
   */
  public async preparePayment(
    request: PreparePaymentRequest
  ): Promise<PreparePaymentResponse> {
    try {
      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      console.log(
        `[PaysoClient] Preparing payment: ${request.paymentId} with token: ${request.selectedToken}`
      );
      const response = await this.apiClient.post(
        `/payments/${request.paymentId}/prepare`,
        {
          selectedToken: request.selectedToken,
        }
      );
      console.log(`[PaysoClient] Payment prepared:`, response.data);
      return response.data;
    } catch (error) {
      console.error("[PaysoClient] Failed to prepare payment:", error);
      throw new Error("Failed to prepare payment");
    }
  }

  /**
   * Execute payment to get transaction data
   */
  public async executePayment(
    request: ExecutePaymentRequest
  ): Promise<ExecutePaymentResponse> {
    try {
      console.log(`[PaysoClient] Executing payment ${request.paymentId}`);

      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      // Add detailed logging
      console.log(
        `[PaysoClient] Checking payment status for ${request.paymentId}`
      );
      const payment = await this.getPayment(request.paymentId);
      console.log(`[PaysoClient] Current payment status: ${payment.status}`);

      if (payment.status !== "pending") {
        console.error(`[PaysoClient] Invalid payment state: ${payment.status}`);
        throw new Error(
          `Payment is no longer in pending state (current state: ${payment.status})`
        );
      }

      console.log(
        `[PaysoClient] Requesting transaction data for ${request.paymentId}`
      );

      // Create a custom axios instance with a longer timeout for this specific request
      const executeApiClient = axios.create({
        baseURL: this.apiUrl,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        timeout: 20000, // 20 second timeout
      });

      const response = await executeApiClient.post(
        `/payments/${request.paymentId}/execute`,
        request
      );

      console.log(`[PaysoClient] Transaction data received:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[PaysoClient] Failed to execute payment:`, error);

      // Check if it's a timeout error
      if (
        error.code === "ECONNABORTED" ||
        (error.message && error.message.includes("timeout"))
      ) {
        console.log(`[PaysoClient] Request timed out, checking payment status`);

        try {
          // If it's a timeout, check if the payment was actually processed
          const updatedPayment = await this.getPayment(request.paymentId);

          if (updatedPayment.status === "processing") {
            console.log(
              `[PaysoClient] Payment is now in processing state despite timeout`
            );

            // Create a fallback response
            return {
              payment: updatedPayment,
              transactionData: {
                isDirectTransfer: true,
                destinationTokenAccount: updatedPayment.destinationWallet,
                amount: updatedPayment.tokenAmount,
                fallback: true,
              },
            };
          }
        } catch (statusCheckError) {
          console.error(
            `[PaysoClient] Failed to check payment status after timeout:`,
            statusCheckError
          );
        }

        throw new Error("Request timed out. Please try again.");
      }

      // Extract and log the error details
      const errorMessage =
        error?.response?.data?.message || error.message || "Unknown error";
      console.error(`[PaysoClient] Error details: ${errorMessage}`);

      throw new Error(`Failed to execute payment: ${errorMessage}`);
    }
  }

  /**
   * Confirm payment with transaction signature
   * This is called after the frontend has successfully sent the transaction
   */
  public async confirmPayment(
    request: ConfirmPaymentRequest
  ): Promise<ConfirmPaymentResponse> {
    try {
      console.log(
        `[PaysoClient] Confirming payment ${request.paymentId} with signature ${request.transactionSignature}`
      );

      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      // Create a custom axios instance with a longer timeout for this specific request
      const confirmApiClient = axios.create({
        baseURL: this.apiUrl,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        timeout: 15000, // 15 second timeout
      });

      const response = await confirmApiClient.post(
        `/payments/${request.paymentId}/confirm`,
        {
          transactionSignature: request.transactionSignature,
        }
      );

      console.log(`[PaysoClient] Payment confirmed:`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`[PaysoClient] Failed to confirm payment:`, error);

      // Check if it's a timeout error
      if (
        error.code === "ECONNABORTED" ||
        (error.message && error.message.includes("timeout"))
      ) {
        console.log(
          `[PaysoClient] Confirmation request timed out, checking payment status`
        );

        try {
          // If it's a timeout, check if the payment was actually confirmed
          const updatedPayment = await this.getPayment(request.paymentId);

          if (updatedPayment.status === "completed") {
            console.log(
              `[PaysoClient] Payment is now completed despite timeout`
            );
            return updatedPayment;
          }

          // If it's still in processing, update locally and return
          if (updatedPayment.status === "processing") {
            console.log(
              `[PaysoClient] Payment still processing, manually updating state`
            );

            // Create a completed payment response
            const completedPayment: ConfirmPaymentResponse = {
              ...updatedPayment,
              status: "completed" as any, // Cast to PaymentStatus
              transactionSignature: request.transactionSignature,
            };

            return completedPayment;
          }
        } catch (statusCheckError) {
          console.error(
            `[PaysoClient] Failed to check payment status after timeout:`,
            statusCheckError
          );
        }

        throw new Error(
          "Confirmation request timed out. The transaction may still be processing."
        );
      }

      const errorMessage =
        error?.response?.data?.message || error.message || "Unknown error";
      throw new Error(`Failed to confirm payment: ${errorMessage}`);
    }
  }

  /**
   * Get popular tokens
   */
  public async getPopularTokens(): Promise<Token[]> {
    try {
      if (!this.apiKeyValidated) {
        await this.validateApiKey();
      }

      console.log(`[PaysoClient] Getting popular tokens`);
      const response = await this.apiClient.get("/payments/tokens/popular");
      console.log(`[PaysoClient] Retrieved ${response.data.length} tokens`);

      return response.data;
    } catch (error) {
      console.error("[PaysoClient] Failed to get popular tokens:", error);
      throw new Error("Failed to get popular tokens");
    }
  }
}
