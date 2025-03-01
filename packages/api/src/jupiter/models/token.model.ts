export interface Token {
  symbol: string;
  name: string;
  address: string; // Mint address
  decimals: number;
  logoURI?: string;
}
