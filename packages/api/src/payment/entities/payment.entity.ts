import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Merchant } from '../../merchant/entities/merchant.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  merchantId: string;

  @ManyToOne(() => Merchant, (merchant) => merchant.payments)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column('decimal', { precision: 18, scale: 6 })
  amount: number;

  @Column()
  currency: string;

  @Column('decimal', { precision: 18, scale: 6, default: 0 })
  tokenAmount: number;

  @Column({ nullable: true })
  selectedToken: string;

  @Column()
  destinationWallet: string;

  @Column({ nullable: true })
  customerWallet: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  transactionSignature: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
