import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from "@solana/spl-token";
import { Payment, Token, PaymentEventType } from "./models";
import { PaysoClient } from "./PaysoClient";

export interface PaymentWidgetOptions {
  apiKey: string;
  apiUrl?: string;
  socketUrl?: string;
  amount: number;
  currency: string;
  customerEmail?: string;
  metadata?: string;
  onPaymentCreated?: (payment: Payment) => void;
  onPaymentPrepared?: (payment: Payment, quote: any) => void;
  onPaymentExecuted?: (payment: Payment, transactionData: any) => void;
  onPaymentCompleted?: (payment: Payment) => void;
  onPaymentFailed?: (payment: Payment, reason: string) => void;
  onTransactionSubmitted?: (payment: Payment, signature: string) => void;
  onClose?: () => void;
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    textColor?: string;
    backgroundColor?: string;
    borderRadius?: string;
  };
}

export interface WalletAdapter {
  publicKey: PublicKey | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (
    transactions: (Transaction | VersionedTransaction)[]
  ) => Promise<(Transaction | VersionedTransaction)[]>;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: any
  ) => Promise<string>;
}

// Common USDC mint address
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export class PaymentWidget {
  private client: PaysoClient;
  private options: PaymentWidgetOptions;
  private payment: Payment | null = null;
  private tokens: Token[] = [];
  private selectedToken: string = USDC_MINT; // Default to USDC
  private wallet: WalletAdapter | null = null;
  private connection: Connection | null = null;
  private containerElement: HTMLElement | null = null;
  private widgetElement: HTMLElement | null = null;
  private isPrepared: boolean = false;
  private isExecuted: boolean = false;
  private isProcessing: boolean = false;
  private transactionData: any = null;
  private activeStep: number = 1; // Track the active step in the payment flow

  // Default theme
  private theme = {
    primaryColor: "#6C5CE7", // Modern purple
    secondaryColor: "#0984E3", // Bright blue
    textColor: "#2D3436",
    backgroundColor: "#FFFFFF",
    borderRadius: "12px",
    boxShadow: "0 12px 24px rgba(0, 0, 0, 0.1)",
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
  };

  constructor(options: PaymentWidgetOptions) {
    this.options = options;

    // Apply custom theme if provided
    if (options.theme) {
      this.theme = { ...this.theme, ...options.theme };
    }

    this.client = new PaysoClient(
      options.apiKey,
      options.apiUrl || "http://localhost:3000",
      options.socketUrl || "http://localhost:3000"
    );

    // Inject CSS for our custom components
    this.injectStyles();
  }

  /**
   * Inject base styles for the widget
   */
  private injectStyles(): void {
    // Prevent duplicate style injection
    if (document.getElementById("payso-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "payso-styles";
    style.textContent = `
      .payso-widget {
        font-family: ${this.theme.fontFamily};
        color: ${this.theme.textColor};
        background-color: ${this.theme.backgroundColor};
        border-radius: ${this.theme.borderRadius};
        box-shadow: ${this.theme.boxShadow};
        overflow: hidden;
        position: relative;
      }
      
      .payso-header {
        padding: 24px 24px 20px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        position: relative;
      }
      
      .payso-header h2 {
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 8px 0;
        color: ${this.theme.textColor};
      }
      
      .payso-amount {
        font-size: 32px;
        font-weight: 700;
        margin: 8px 0;
        color: ${this.theme.textColor};
      }
      
      .payso-body {
        padding: 24px;
      }
      
      .payso-status {
        margin-bottom: 24px;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        text-align: center;
      }
      
      .payso-status.pending {
        background-color: rgba(253, 203, 110, 0.15);
        color: #CC8E35;
      }
      
      .payso-status.processing {
        background-color: rgba(108, 92, 231, 0.1);
        color: ${this.theme.primaryColor};
      }
      
      .payso-status.completed {
        background-color: rgba(39, 174, 96, 0.1);
        color: #27AE60;
      }
      
      .payso-status.failed {
        background-color: rgba(235, 59, 90, 0.1);
        color: #EB3B5A;
      }

      .payso-steps {
        display: flex;
        justify-content: space-between;
        margin-bottom: 32px;
        position: relative;
      }
      
      .payso-steps::before {
        content: "";
        position: absolute;
        top: 16px;
        left: 10%;
        right: 10%;
        height: 2px;
        background-color: #E0E0E0;
        z-index: 1;
      }
      
      .payso-step {
        position: relative;
        z-index: 2;
        text-align: center;
        width: 33%;
      }
      
      .payso-step-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background-color: #E0E0E0;
        margin: 0 auto 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: white;
        position: relative;
      }
      
      .payso-step.active .payso-step-circle {
        background-color: ${this.theme.primaryColor};
      }
      
      .payso-step.completed .payso-step-circle {
        background-color: #27AE60;
      }
      
      .payso-step-label {
        font-size: 12px;
        color: #A0A0A0;
        font-weight: 500;
      }
      
      .payso-step.active .payso-step-label {
        color: ${this.theme.primaryColor};
        font-weight: 600;
      }
      
      .payso-step.completed .payso-step-label {
        color: #27AE60;
      }
      
      .payso-form-group {
        margin-bottom: 20px;
      }
      
      .payso-label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 500;
        color: #4A4A4A;
      }
      
      .payso-select {
        width: 100%;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid #E0E0E0;
        background-color: #FAFAFA;
        font-size: 15px;
        color: #333;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 16px center;
        cursor: pointer;
        transition: border-color 0.15s ease;
      }
      
      .payso-select:hover, .payso-select:focus {
        border-color: #BBB;
        outline: none;
      }
      
      .payso-select:disabled {
        background-color: #F0F0F0;
        cursor: not-allowed;
        opacity: 0.7;
      }
      
      .payso-wallet-button {
        width: 100%;
        padding: 14px 20px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .payso-wallet-button.connected {
        background-color: rgba(39, 174, 96, 0.1);
        color: #27AE60;
      }
      
      .payso-wallet-button.disconnected {
        background-color: rgba(9, 132, 227, 0.1);
        color: ${this.theme.secondaryColor};
      }
      
      .payso-wallet-button:hover {
        filter: brightness(0.95);
      }
      
      .payso-info-box {
        padding: 16px;
        background-color: #F8F9FA;
        border-radius: 8px;
        margin-bottom: 20px;
        font-size: 14px;
        text-align: center;
      }
      
      .payso-button {
        width: 100%;
        padding: 16px 24px;
        border-radius: 8px;
        border: none;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .payso-button.primary {
        background-color: ${this.theme.primaryColor};
        color: white;
      }
      
      .payso-button.secondary {
        background-color: ${this.theme.secondaryColor};
        color: white;
      }
      
      .payso-button.warn {
        background-color: #EB3B5A;
        color: white;
      }
      
      .payso-button.success {
        background-color: #27AE60;
        color: white;
      }
      
      .payso-button:hover {
        filter: brightness(1.05);
        transform: translateY(-1px);
      }
      
      .payso-button:active {
        transform: translateY(0);
      }
      
      .payso-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
      }

      .payso-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #FFF;
        animation: payso-spin 1s ease-in-out infinite;
      }

      @keyframes payso-spin {
        to { transform: rotate(360deg); }
      }

      .payso-footer {
        padding: 16px 24px;
        border-top: 1px solid rgba(0, 0, 0, 0.06);
        text-align: center;
        font-size: 12px;
        color: #999;
      }

      .payso-close {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 24px;
        height: 24px;
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.2s ease;
        background: transparent;
        border: none;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .payso-close:hover {
        opacity: 0.8;
      }

      .payso-close::before,
      .payso-close::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 2px;
        background-color: #333;
      }

      .payso-close::before {
        transform: rotate(45deg);
      }

      .payso-close::after {
        transform: rotate(-45deg);
      }

      .payso-token-logo {
        width: 20px;
        height: 20px;
        margin-right: 8px;
        border-radius: 50%;
        object-fit: cover;
      }

      .payso-token-option {
        display: flex;
        align-items: center;
      }

      .payso-error {
        margin-top: 10px;
        padding: 12px;
        background-color: rgba(235, 59, 90, 0.1);
        border-radius: 8px;
        color: #EB3B5A;
        font-size: 14px;
        text-align: center;
      }

      .payso-completion-animation {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 20px 0;
      }

      .payso-check-circle {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: #27AE60;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: payso-scale-in 0.3s ease-out forwards;
      }

      .payso-check-mark {
        width: 32px;
        height: 24px;
        border-bottom: 4px solid white;
        border-right: 4px solid white;
        transform: rotate(45deg);
        margin-bottom: 8px;
        animation: payso-check-animation 0.3s ease-out 0.3s forwards;
        opacity: 0;
      }

      @keyframes payso-scale-in {
        from { transform: scale(0); }
        to { transform: scale(1); }
      }

      @keyframes payso-check-animation {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .payso-tx-link {
        display: inline-block;
        margin: 16px 0;
        padding: 10px 16px;
        background-color: #F0F0F0;
        border-radius: 8px;
        color: #555;
        text-decoration: none;
        transition: all 0.2s ease;
        font-size: 14px;
      }

      .payso-tx-link:hover {
        background-color: #E0E0E0;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Format token amount based on token decimals
   */
  private formatTokenAmount(amount: number, tokenAddress: string): string {
    // Find the token info to get decimals
    const tokenInfo = this.tokens.find((t) => t.address === tokenAddress);
    if (!tokenInfo) {
      return amount.toLocaleString();
    }

    // Format based on token decimals (e.g., USDC has 6 decimals)
    const decimals = tokenInfo.decimals || 6;
    const divisor = Math.pow(10, decimals);
    const formattedAmount = (amount / divisor).toLocaleString(undefined, {
      minimumFractionDigits: Math.min(decimals, 2),
      maximumFractionDigits: Math.min(decimals, 6),
    });

    return formattedAmount;
  }

  /**
   * Initialize the payment widget
   */
  public async initialize(
    container: HTMLElement,
    wallet: WalletAdapter,
    connection: Connection
  ): Promise<void> {
    this.containerElement = container;
    this.wallet = wallet;
    this.connection = connection;

    try {
      // Set loading state
      this.renderLoadingState();

      // Get popular tokens
      this.tokens = await this.client.getPopularTokens();

      // Create payment or get existing payment if provided
      if (!this.payment) {
        this.payment = await this.client.createPayment({
          amount: this.options.amount,
          currency: this.options.currency,
          customerEmail: this.options.customerEmail,
          metadata: this.options.metadata,
        });

        if (this.options.onPaymentCreated) {
          this.options.onPaymentCreated(this.payment);
        }
      }

      // Subscribe to payment events
      this.client.subscribeToPaymentEvents(
        this.payment.id,
        this.handlePaymentEvent.bind(this)
      );

      // Check if payment is already in a specific state
      if (this.payment && this.payment.status !== "pending") {
        // Update UI state based on payment status
        this.isPrepared = this.payment.selectedToken !== "";
        this.isExecuted = this.payment.status === "processing";

        // Update step indicators
        if (this.isPrepared) this.activeStep = 2;
        if (this.isExecuted) this.activeStep = 3;
        if (this.payment.status === "completed") this.activeStep = 4;
      }

      // If wallet is connected, filter tokens to only show ones the user has
      if (wallet.connected && wallet.publicKey) {
        await this.filterTokensByWalletBalance();
      }

      // Render the widget
      this.render();
    } catch (error) {
      console.error("Error initializing payment widget:", error);
      this.renderErrorState(error);
      throw error;
    }
  }

  /**
   * Filter tokens to only show ones that the user has in their wallet
   */
  private async filterTokensByWalletBalance(): Promise<void> {
    if (!this.wallet || !this.wallet.publicKey || !this.connection) {
      return;
    }

    try {
      // Get all token accounts owned by the user
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        this.wallet.publicKey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          ),
        }
      );

      if (tokenAccounts.value.length === 0) {
        console.log("No token accounts found, showing all available tokens");
        return; // Don't filter if no token accounts found
      }

      // Create a map of token mint addresses to balances
      const userTokens = new Map<string, number>();

      tokenAccounts.value.forEach((account) => {
        const parsedAccountInfo = account.account.data.parsed.info;
        const mintAddress = parsedAccountInfo.mint;
        const balance = parseInt(parsedAccountInfo.tokenAmount.amount);

        if (balance > 0) {
          userTokens.set(mintAddress, balance);
        }
      });

      // Always include USDC even if user doesn't have it
      if (!userTokens.has(USDC_MINT)) {
        userTokens.set(USDC_MINT, 0);
      }

      // Filter tokens to only include ones the user has
      if (userTokens.size > 0) {
        this.tokens = this.tokens.filter((token) =>
          userTokens.has(token.address)
        );

        // Update selected token if it's not in the filtered list
        if (!userTokens.has(this.selectedToken)) {
          this.selectedToken = USDC_MINT; // Default to USDC
        }
      }

      console.log(
        `Filtered to ${this.tokens.length} tokens the user has in wallet`
      );
    } catch (error) {
      console.error("Error filtering tokens by wallet balance:", error);
      // Don't filter if there's an error
    }
  }

  /**
   * Render a loading state while initializing
   */
  private renderLoadingState(): void {
    if (!this.containerElement) return;

    // Clear container
    this.containerElement.innerHTML = "";

    // Create loading element with ID so we can remove it later
    const loadingElement = document.createElement("div");
    loadingElement.id = "crypto-pay-hub-loading";
    loadingElement.className = "payso-widget";
    loadingElement.style.padding = "30px";
    loadingElement.style.textAlign = "center";

    const spinner = document.createElement("div");
    spinner.style.display = "inline-block";
    spinner.style.width = "30px";
    spinner.style.height = "30px";
    spinner.style.border = "3px solid rgba(108, 92, 231, 0.2)";
    spinner.style.borderRadius = "50%";
    spinner.style.borderTopColor = this.theme.primaryColor;
    spinner.style.animation = "payso-spin 1s ease-in-out infinite";

    const loadingText = document.createElement("div");
    loadingText.textContent = "Initializing payment...";
    loadingText.style.marginTop = "15px";
    loadingText.style.fontSize = "15px";
    loadingText.style.color = "#666";

    loadingElement.appendChild(spinner);
    loadingElement.appendChild(loadingText);

    this.containerElement.appendChild(loadingElement);
  }

  /**
   * Render an error state
   */
  private renderErrorState(error: any): void {
    if (!this.containerElement) return;

    // Clear container
    this.containerElement.innerHTML = "";

    // Create error element
    const errorElement = document.createElement("div");
    errorElement.className = "payso-widget";
    errorElement.style.padding = "30px";

    const errorIcon = document.createElement("div");
    errorIcon.innerHTML = `
      <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#EB3B5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
    errorIcon.style.textAlign = "center";
    errorIcon.style.marginBottom = "15px";

    const errorTitle = document.createElement("div");
    errorTitle.textContent = "Failed to initialize payment";
    errorTitle.style.textAlign = "center";
    errorTitle.style.fontSize = "18px";
    errorTitle.style.fontWeight = "600";
    errorTitle.style.marginBottom = "10px";
    errorTitle.style.color = "#EB3B5A";

    const errorMessage = document.createElement("div");
    errorMessage.textContent =
      error?.message || "An unexpected error occurred. Please try again.";
    errorMessage.style.textAlign = "center";
    errorMessage.style.fontSize = "14px";
    errorMessage.style.color = "#666";
    errorMessage.style.marginBottom = "20px";

    const retryButton = document.createElement("button");
    retryButton.className = "payso-button primary";
    retryButton.textContent = "Retry";
    retryButton.onclick = () => {
      if (this.wallet && this.connection && this.containerElement) {
        this.initialize(this.containerElement, this.wallet, this.connection);
      }
    };

    errorElement.appendChild(errorIcon);
    errorElement.appendChild(errorTitle);
    errorElement.appendChild(errorMessage);
    errorElement.appendChild(retryButton);

    this.containerElement.appendChild(errorElement);
  }

  /**
   * Handle payment events from WebSocket
   */
  private handlePaymentEvent(event: any): void {
    if (!this.payment || event.paymentId !== this.payment.id) {
      return;
    }

    console.log("Payment event received:", event);

    switch (event.type) {
      case PaymentEventType.PAYMENT_UPDATED:
        this.payment = event.data;

        // Update UI state based on payment status
        if (this.payment && this.payment.status !== "pending") {
          this.isPrepared = this.payment.selectedToken !== "";
          this.isExecuted = this.payment.status === "processing";

          // Update step indicators
          if (this.isPrepared) this.activeStep = 2;
          if (this.isExecuted) this.activeStep = 3;
        }

        this.render();
        break;
      case PaymentEventType.PAYMENT_COMPLETED:
        this.payment = event.data;
        this.isProcessing = false;
        this.activeStep = 4; // Set to completed step

        if (this.options.onPaymentCompleted && this.payment) {
          this.options.onPaymentCompleted(this.payment);
        }
        this.render();
        break;
      case PaymentEventType.PAYMENT_FAILED:
        this.payment = event.data.payment;
        this.isProcessing = false;
        if (this.options.onPaymentFailed && this.payment) {
          this.options.onPaymentFailed(this.payment, event.data.reason);
        }
        this.render();
        break;
      case PaymentEventType.TRANSACTION_SUBMITTED:
        this.payment = event.data.payment;
        if (this.options.onTransactionSubmitted && this.payment) {
          this.options.onTransactionSubmitted(
            this.payment,
            event.data.transactionSignature
          );
        }
        this.render();
        break;
      default:
        break;
    }
  }

  /**
   * Prepare payment with selected token
   */
  private async preparePayment(): Promise<void> {
    if (!this.payment) {
      throw new Error("Payment not initialized");
    }

    try {
      this.isProcessing = true;
      this.render(); // Update UI to show processing state

      const result = await this.client.preparePayment({
        paymentId: this.payment.id,
        selectedToken: this.selectedToken,
      });

      this.payment = result.payment;
      this.isPrepared = true;
      this.isProcessing = false;
      this.activeStep = 2; // Update step indicator

      if (this.options.onPaymentPrepared) {
        this.options.onPaymentPrepared(this.payment, result.quote);
      }

      this.render();
    } catch (error) {
      console.error("Failed to prepare payment:", error);
      this.isProcessing = false;
      this.render(); // Update UI to show error
      throw error;
    }
  }

  /**
   * Execute payment with customer wallet
   */
  private async executePayment(): Promise<void> {
    if (!this.payment || !this.wallet || !this.wallet.publicKey) {
      throw new Error("Payment not initialized or wallet not connected");
    }

    // Prevent multiple executions
    if (this.isProcessing || this.payment.status !== "pending") {
      console.warn("Payment already being processed or not in pending state");
      return;
    }

    try {
      this.isProcessing = true;
      this.render(); // Update UI to show processing state

      const result = await this.client.executePayment({
        paymentId: this.payment.id,
        selectedToken: this.selectedToken,
        customerWallet: this.wallet.publicKey.toString(),
      });

      this.payment = result.payment;
      this.transactionData = result.transactionData;
      this.isExecuted = true;
      this.isProcessing = false;
      this.activeStep = 3; // Update step indicator

      if (this.options.onPaymentExecuted) {
        this.options.onPaymentExecuted(this.payment, this.transactionData);
      }

      this.render();
    } catch (error) {
      console.error("Failed to execute payment:", error);
      this.isProcessing = false;
      this.render(); // Update UI to show error
      throw error;
    }
  }

  /**
   * Process the payment transaction - sign and submit
   */
  private async processTransaction(): Promise<void> {
    if (
      !this.payment ||
      !this.wallet ||
      !this.connection ||
      !this.transactionData
    ) {
      throw new Error("Payment execution not completed");
    }

    // Prevent multiple transaction processing
    if (this.isProcessing) {
      console.warn("Transaction already being processed");
      return;
    }

    try {
      this.isProcessing = true;
      this.render(); // Update UI to show processing state

      let transactionSignature: string;

      if (this.transactionData.isDirectTransfer) {
        // Direct USDC transfer
        console.log("Direct USDC transfer transaction", this.transactionData);
        const { destinationTokenAccount, amount } = this.transactionData;

        // Get user's USDC token account
        const userPublicKey = this.wallet.publicKey!;
        const usdcMintPublicKey = new PublicKey(USDC_MINT);
        const userUsdcAccount = await getAssociatedTokenAddress(
          usdcMintPublicKey,
          userPublicKey
        );

        // Create transaction
        const transaction = new Transaction();

        // Add transfer instruction
        const transferInstruction = createTransferInstruction(
          userUsdcAccount,
          new PublicKey(destinationTokenAccount),
          userPublicKey,
          parseInt(amount)
        );

        transaction.add(transferInstruction);

        // Set recent blockhash and fee payer
        transaction.feePayer = userPublicKey;
        transaction.recentBlockhash = (
          await this.connection.getLatestBlockhash()
        ).blockhash;

        // Sign and send transaction
        transactionSignature = await this.wallet.sendTransaction(
          transaction,
          this.connection
        );
      } else {
        // Swap transaction using Jupiter
        const { swapTransaction } = this.transactionData;

        // Decode the transaction
        const buffer = Buffer.from(swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(buffer);

        // Sign and send transaction
        transactionSignature = await this.wallet.sendTransaction(
          transaction,
          this.connection
        );
      }

      // Display transaction signature in UI
      this.renderTransactionSubmitted(transactionSignature);

      // Optional: Wait for confirmation
      try {
        await this.connection.confirmTransaction(
          transactionSignature,
          "confirmed"
        );
      } catch (confirmError) {
        console.warn("Transaction confirmation error:", confirmError);
        // Continue anyway since we'll tell the backend about the transaction
      }

      // Confirm payment with the transaction signature
      await this.client.confirmPayment({
        paymentId: this.payment.id,
        transactionSignature,
      });

      // Update UI to completed state
      this.isProcessing = false;
      this.activeStep = 4; // Set to completed step
      this.render();
    } catch (error) {
      console.error("Transaction failed:", error);
      this.isProcessing = false;
      this.render(); // Update UI to show error
      throw error;
    }
  }

  /**
   * Render a temporary state to show transaction submission
   */
  private renderTransactionSubmitted(signature: string): void {
    if (!this.widgetElement) return;

    // Find the action section in the widget
    const actionSection = this.widgetElement.querySelector(".payso-actions");
    if (!actionSection) return;

    // Clear action section
    actionSection.innerHTML = "";

    // Create submitting indicator
    const submittingBox = document.createElement("div");
    submittingBox.className = "payso-info-box";
    submittingBox.style.backgroundColor = "rgba(108, 92, 231, 0.1)";
    submittingBox.style.color = this.theme.primaryColor;
    submittingBox.style.textAlign = "center";
    submittingBox.style.padding = "20px";

    const spinner = document.createElement("div");
    spinner.className = "payso-spinner";
    spinner.style.width = "24px";
    spinner.style.height = "24px";
    spinner.style.margin = "0 auto 16px";
    spinner.style.borderWidth = "3px";
    spinner.style.borderTopColor = this.theme.primaryColor;
    spinner.style.borderColor = `rgba(108, 92, 231, 0.2)`;

    const submittingText = document.createElement("div");
    submittingText.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">Transaction Submitted</div>
      <div style="font-size: 13px; color: #666; margin-bottom: 12px;">Your transaction is being processed by the Solana network.</div>
      <a href="https://explorer.solana.com/tx/${signature}" target="_blank" class="payso-tx-link">
        View on Explorer
      </a>
    `;

    submittingBox.appendChild(spinner);
    submittingBox.appendChild(submittingText);
    actionSection.appendChild(submittingBox);
  }

  /**
   * Handle token selection change
   */
  private handleTokenChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedToken = select.value;
    this.isPrepared = false;
    this.isExecuted = false;
    this.render();
  }

  /**
   * Handle wallet connection button click
   */
  private async handleConnectWallet(): Promise<void> {
    if (!this.wallet) return;

    try {
      if (!this.wallet.connected) {
        await this.wallet.connect();
      } else {
        await this.wallet.disconnect();
      }
      this.render();
    } catch (error) {
      console.error("Wallet connection error:", error);
    }
  }

  /**
   * Render the payment widget
   */
  private render(): void {
    if (!this.containerElement || !this.payment) return;

    // Remove any loading element if it exists
    const loadingElement = document.getElementById("crypto-pay-hub-loading");
    if (loadingElement && loadingElement.parentNode === this.containerElement) {
      this.containerElement.removeChild(loadingElement);
    }

    // Clear container
    if (this.widgetElement) {
      this.containerElement.removeChild(this.widgetElement);
    }

    // Create widget element
    this.widgetElement = document.createElement("div");
    this.widgetElement.className = "payso-widget";
    this.widgetElement.style.maxWidth = "420px";
    this.widgetElement.style.margin = "0 auto";

    // Add header with close button
    const header = document.createElement("div");
    header.className = "payso-header";

    const closeButton = document.createElement("button");
    closeButton.className = "payso-close";
    closeButton.title = "Close";
    closeButton.onclick = () => {
      if (this.options.onClose) {
        this.options.onClose();
      }
    };

    const title = document.createElement("h2");
    title.textContent = "Crypto Payment";

    const amount = document.createElement("div");
    amount.className = "payso-amount";

    // Format the fiat amount properly
    const fiatAmount = this.payment.amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    amount.textContent = `${fiatAmount} ${this.payment.currency}`;

    header.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(amount);
    this.widgetElement.appendChild(header);

    // Body content
    const body = document.createElement("div");
    body.className = "payso-body";

    // Payment status
    const status = document.createElement("div");
    status.className = `payso-status ${this.payment.status}`;

    switch (this.payment.status) {
      case "pending":
        status.textContent = "Awaiting Payment";
        break;
      case "processing":
        status.textContent = "Processing Transaction";
        break;
      case "completed":
        status.textContent = "Payment Successful";
        break;
      case "failed":
        status.textContent = "Payment Failed";
        break;
    }

    body.appendChild(status);

    // If payment is completed or failed, show different UI
    if (this.payment.status === "completed") {
      this.renderCompletedState(body);
    } else if (this.payment.status === "failed") {
      this.renderFailedState(body);
    } else {
      // Payment progress steps
      const stepsContainer = document.createElement("div");
      stepsContainer.className = "payso-steps";

      // Create step indicators
      const steps = [
        { number: 1, label: "Token" },
        { number: 2, label: "Prepare" },
        { number: 3, label: "Sign" },
      ];

      steps.forEach((step) => {
        const stepElement = document.createElement("div");
        stepElement.className = `payso-step ${
          this.activeStep >= step.number ? "active" : ""
        } ${this.activeStep > step.number ? "completed" : ""}`;

        const stepCircle = document.createElement("div");
        stepCircle.className = "payso-step-circle";

        // If completed, show checkmark instead of number
        if (this.activeStep > step.number) {
          stepCircle.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
        } else {
          stepCircle.textContent = step.number.toString();
        }

        const stepLabel = document.createElement("div");
        stepLabel.className = "payso-step-label";
        stepLabel.textContent = step.label;

        stepElement.appendChild(stepCircle);
        stepElement.appendChild(stepLabel);
        stepsContainer.appendChild(stepElement);
      });

      body.appendChild(stepsContainer);

      // Main payment flow content - changes based on current step
      const actionContent = document.createElement("div");
      actionContent.className = "payso-actions";

      // Step 1: Select token and connect wallet
      if (!this.isPrepared) {
        this.renderTokenSelectionStep(actionContent);
      }
      // Step 2: Prepare transaction
      else if (!this.isExecuted) {
        this.renderPrepareTransactionStep(actionContent);
      }
      // Step 3: Sign transaction
      else {
        this.renderSignTransactionStep(actionContent);
      }

      body.appendChild(actionContent);
    }

    this.widgetElement.appendChild(body);

    // Add footer with branding
    const footer = document.createElement("div");
    footer.className = "payso-footer";
    footer.innerHTML = `
      <div>Powered by Payso</div>
    `;
    this.widgetElement.appendChild(footer);

    this.containerElement.appendChild(this.widgetElement);
  }

  /**
   * Render the token selection step (Step 1)
   */
  private renderTokenSelectionStep(container: HTMLElement): void {
    // Token selection dropdown
    const tokenSection = document.createElement("div");
    tokenSection.className = "payso-form-group";

    const tokenLabel = document.createElement("label");
    tokenLabel.className = "payso-label";
    tokenLabel.textContent = "Select payment token:";

    const tokenSelect = document.createElement("select");
    tokenSelect.className = "payso-select";
    tokenSelect.disabled = this.isProcessing;
    tokenSelect.onchange = this.handleTokenChange.bind(this);

    this.tokens.forEach((token) => {
      const option = document.createElement("option");
      option.value = token.address;
      console.log("Token", token);
      // Create a more visual token option if logo is available
      if (token.logoURI) {
        const optionContent = document.createElement("div");
        optionContent.className = "payso-token-option";

        const logo = document.createElement("img");
        logo.className = "payso-token-logo";
        logo.src = token.logoURI;
        logo.alt = token.symbol;

        const text = document.createTextNode(`${token.symbol} - ${token.name}`);

        optionContent.appendChild(logo);
        optionContent.appendChild(text);

        // We can't directly add HTML to option elements in most browsers
        // Using data attributes as a workaround
        option.setAttribute("data-logo", token.logoURI);
        option.textContent = `${token.symbol} - ${token.name}`;
      } else {
        option.textContent = `${token.symbol} - ${token.name}`;
      }

      if (token.address === this.selectedToken) {
        option.selected = true;
      }

      tokenSelect.appendChild(option);
    });

    tokenSection.appendChild(tokenLabel);
    tokenSection.appendChild(tokenSelect);
    container.appendChild(tokenSection);

    // Wallet connection button
    const walletSection = document.createElement("div");
    walletSection.className = "payso-form-group";

    const walletButton = document.createElement("button");
    walletButton.className = `payso-wallet-button ${
      this.wallet?.connected ? "connected" : "disconnected"
    }`;

    if (this.wallet?.connected) {
      const walletAddress = this.wallet.publicKey?.toString() || "";
      const shortenedAddress = `${walletAddress.slice(
        0,
        6
      )}...${walletAddress.slice(-4)}`;

      walletButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
          <polyline points="3 7 12 13 21 7"></polyline>
        </svg>
        Connected: ${shortenedAddress}
      `;
    } else {
      walletButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        Connect Wallet
      `;
    }

    walletButton.onclick = this.handleConnectWallet.bind(this);
    walletSection.appendChild(walletButton);
    container.appendChild(walletSection);

    // Prepare button
    const payButton = document.createElement("button");
    payButton.className = "payso-button primary";
    payButton.disabled = !this.wallet?.connected || this.isProcessing;

    if (this.isProcessing) {
      payButton.innerHTML = `
        <span class="payso-spinner"></span>
        Processing...
      `;
    } else {
      payButton.innerHTML = `Pay`;
    }

    if (!this.wallet?.connected || this.isProcessing) {
      payButton.style.opacity = "0.6";
      payButton.style.cursor = "not-allowed";
    }

    payButton.onclick = async () => {
      try {
        // Disable the pay button immediately
        payButton.disabled = true;
        payButton.innerHTML = `
          <span class="payso-spinner"></span>
          Processing...
        `;

        // Prepare the payment
        await this.preparePayment();

        // Execute the payment immediately after preparation
        await this.executePayment();

        // Process the transaction immediately after execution
        await this.processTransaction();
      } catch (error: any) {
        // Handle error
        payButton.disabled = false;
        payButton.innerHTML = `Pay`; // Re-enable the button
        const errorMessage = document.createElement("div");
        errorMessage.className = "payso-error";
        errorMessage.textContent =
          error?.message || "Failed to process payment";
        container.appendChild(errorMessage);
      }
    };

    container.appendChild(payButton);
  }

  /**
   * Render the prepare transaction step (Step 2)
   */
  private renderPrepareTransactionStep(container: HTMLElement): void {
    // This step is no longer needed, so we can remove its content
    container.innerHTML = "";
  }

  /**
   * Render the sign transaction step (Step 3)
   */
  private renderSignTransactionStep(container: HTMLElement): void {
    // This step is no longer needed, so we can remove its content
    container.innerHTML = "";
  }

  /**
   * Render the completed payment state
   */
  private renderCompletedState(container: HTMLElement): void {
    // Completion animation
    const completionAnimation = document.createElement("div");
    completionAnimation.className = "payso-completion-animation";

    const checkCircle = document.createElement("div");
    checkCircle.className = "payso-check-circle";

    const checkMark = document.createElement("div");
    checkMark.className = "payso-check-mark";

    checkCircle.appendChild(checkMark);
    completionAnimation.appendChild(checkCircle);
    container.appendChild(completionAnimation);

    // Success message
    const successMessage = document.createElement("div");
    successMessage.style.textAlign = "center";
    successMessage.style.margin = "20px 0";

    const messageTitle = document.createElement("div");
    messageTitle.style.fontSize = "22px";
    messageTitle.style.fontWeight = "600";
    messageTitle.style.marginBottom = "8px";
    messageTitle.style.color = "#27AE60";
    messageTitle.textContent = "Payment Successful!";

    const messageDetails = document.createElement("div");
    messageDetails.style.fontSize = "14px";
    messageDetails.style.color = "#666";
    messageDetails.textContent =
      "Your payment has been processed successfully.";

    successMessage.appendChild(messageTitle);
    successMessage.appendChild(messageDetails);
    container.appendChild(successMessage);

    // Transaction details
    if (this.payment?.transactionSignature) {
      const txDetailsBox = document.createElement("div");
      txDetailsBox.className = "payso-info-box";
      txDetailsBox.style.marginBottom = "24px";

      txDetailsBox.innerHTML = `
        <div style="margin-bottom: 12px; text-align: center;">
          <a href="https://explorer.solana.com/tx/${
            this.payment?.transactionSignature
          }" target="_blank" class="payso-tx-link" style="display: inline-flex; align-items: center; gap: 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            View Transaction
          </a>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #666;">
          <span>Transaction ID:</span>
          <span>${this.payment?.transactionSignature.slice(
            0,
            8
          )}...${this.payment?.transactionSignature.slice(-8)}</span>
        </div>
      `;

      container.appendChild(txDetailsBox);
    }

    // Close button
    const closeButton = document.createElement("button");
    closeButton.className = "payso-button primary";
    closeButton.textContent = "Close";
    closeButton.onclick = () => {
      if (this.options.onClose) {
        this.options.onClose();
      }
    };

    container.appendChild(closeButton);
  }

  /**
   * Render the failed payment state
   */
  private renderFailedState(container: HTMLElement): void {
    // Error icon
    const errorContainer = document.createElement("div");
    errorContainer.style.textAlign = "center";
    errorContainer.style.margin = "20px 0";

    errorContainer.innerHTML = `
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#EB3B5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;

    container.appendChild(errorContainer);

    // Error message
    const errorMessage = document.createElement("div");
    errorMessage.style.textAlign = "center";
    errorMessage.style.margin = "20px 0";

    const messageTitle = document.createElement("div");
    messageTitle.style.fontSize = "22px";
    messageTitle.style.fontWeight = "600";
    messageTitle.style.marginBottom = "8px";
    messageTitle.style.color = "#EB3B5A";
    messageTitle.textContent = "Payment Failed";

    const messageDetails = document.createElement("div");
    messageDetails.style.fontSize = "14px";
    messageDetails.style.color = "#666";
    messageDetails.textContent = "There was a problem processing your payment.";

    errorMessage.appendChild(messageTitle);
    errorMessage.appendChild(messageDetails);
    container.appendChild(errorMessage);

    // Try again button
    const retryButton = document.createElement("button");
    retryButton.className = "payso-button primary";
    retryButton.textContent = "Try Again";
    retryButton.onclick = () => {
      // Reset the payment flow
      this.isPrepared = false;
      this.isExecuted = false;
      this.isProcessing = false;
      this.activeStep = 1;
      this.render();
    };

    container.appendChild(retryButton);

    // Close button
    const closeButton = document.createElement("button");
    closeButton.className = "payso-button";
    closeButton.style.backgroundColor = "transparent";
    closeButton.style.color = "#666";
    closeButton.style.marginTop = "12px";
    closeButton.textContent = "Cancel";
    closeButton.onclick = () => {
      if (this.options.onClose) {
        this.options.onClose();
      }
    };

    container.appendChild(closeButton);
  }

  /**
   * Mount the widget to a DOM element
   */
  public mount(
    container: HTMLElement,
    wallet: WalletAdapter,
    connection: Connection
  ): Promise<void> {
    return this.initialize(container, wallet, connection);
  }

  /**
   * Unmount the widget
   */
  public unmount(): void {
    if (this.containerElement && this.widgetElement) {
      this.containerElement.removeChild(this.widgetElement);
      this.widgetElement = null;
    }

    this.client.disconnect();
  }

  /**
   * Set an existing payment instead of creating a new one
   */
  public setPayment(payment: Payment): void {
    this.payment = payment;

    // Update state based on payment status
    this.isPrepared = payment.selectedToken !== "";
    this.isExecuted = payment.status === "processing";

    // Update step indicators
    if (this.isPrepared) this.activeStep = 2;
    if (this.isExecuted) this.activeStep = 3;
    if (payment.status === "completed") this.activeStep = 4;

    if (this.containerElement) {
      this.render();
    }
  }
}
