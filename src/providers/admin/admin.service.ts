import { STELLAR_OPTIONS } from '../../constants';
import { StellarModuleConfig } from '../../types';
import { Inject, Injectable } from '@nestjs/common';
import { ServerService } from '../server.service';
import { AccountUtilsService } from '../account/account-utils.service';
import { SignersService } from '../signers.service';
import {
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  OperationOptions,
  SignerOptions,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarModuleMode } from '../../enums';
import { getAssetCode } from '../../utils/getAssetCode';

type TPayment = {
  asset: string;
  amount: number;
  to: { publicKey?: string; secretKey?: string };
};

@Injectable()
export class AdminService {
  private payBy: string;
  private sponsorBy: string;
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly serverService: ServerService,
    private readonly accountUtilsService: AccountUtilsService,
    private readonly signersService: SignersService,
  ) {
    this.payBy = this.options.account.accounts.find(
      (account) => account.type === this.options.payments.config.pay_by,
    ).public;
    if (this.options.payments.config.sponsor_by) {
      this.sponsorBy = this.options.account.accounts.find(
        (account) => account.type === this.options.payments.config.sponsor_by,
      ).public;
    }
  }

  public async sendAdminPayment(payments: TPayment[], getTransaction?: boolean) {
    const { base = BASE_FEE } = await this.serverService.getFees();
    const account = await this.accountUtilsService.getAccount(this.payBy);

    const sendPaymentTransaction = new TransactionBuilder(account, {
      fee: base,
      networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
    });
    let extraSigners: Keypair[] = [];
    for (const { asset, amount, to } of payments) {
      const ASSET = getAssetCode(asset);
      const publicKey = to.secretKey ? Keypair.fromSecret(to.secretKey).publicKey() : to.publicKey;
      const hasTrustline = await this.accountUtilsService.getBalances(publicKey, ASSET.code);
      if (!hasTrustline && to.secretKey && asset !== 'XLM') {
        const balances: any = await this.accountUtilsService.getBalances(publicKey);
        const xlm = parseFloat((balances.find((b) => b.asset_type === 'native') || { balance: 0 }).balance);
        const xlmUsed = (balances.filter((b) => b.asset_type !== 'native') || []).length * 0.6;
        if (xlm < xlmUsed + 2) {
          const sponsor = this.sponsorBy || this.payBy;
          sendPaymentTransaction.addOperation(
            Operation.payment({
              destination: publicKey,
              asset: Asset.native(),
              amount: '0.5',
              source: sponsor,
            }),
          );
        }
        extraSigners = [...extraSigners, Keypair.fromSecret(to.secretKey)];
        sendPaymentTransaction.addOperation(
          Operation.changeTrust({
            asset: ASSET,
            source: publicKey,
          }),
        );
      }
      sendPaymentTransaction.addOperation(
        Operation.payment({
          destination: publicKey,
          asset: ASSET,
          amount: amount.toString(),
        }),
      );
    }

    const transactionTx = sendPaymentTransaction.setTimeout(30).build();
    const [transactionSigned, validToSign] = await this.signersService.signTransaction(transactionTx, extraSigners);
    if (!validToSign) {
      return transactionSigned.toXDR();
    }
    if (getTransaction) {
      return transactionSigned;
    }

    await this.serverService.submitTransaction(transactionSigned);
    return transactionSigned.hash().toString('hex');
  }
  public async sendAdminPriorityPayment(payments: TPayment[]) {
    const transaction = await this.sendAdminPayment(payments, true);
    if (typeof transaction === 'string') {
      return transaction;
    }
    const { max = BASE_FEE } = await this.serverService.getFees();
    const keyPair = Keypair.fromPublicKey(this.payBy);
    const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(keyPair, max, transaction, Networks[this.options.mode || StellarModuleMode.TESTNET]);
    const [transactionSigned, validToSign] = await this.signersService.signTransaction(feeBumpTx as unknown as Transaction);
    if (!validToSign) {
      return transactionSigned.toXDR();
    }
    await this.serverService.submitTransaction(transactionSigned);
    return transactionSigned.hash().toString('hex');
  }

  async addSigners(publicKey: string, signers: { weight: number; publicKey: string }[], options: OperationOptions.SetOptions<SignerOptions>) {
    const mainAccount = await this.accountUtilsService.getAccount(publicKey);
    const transaction = new TransactionBuilder(mainAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
    });
    signers.forEach((signer) => {
      transaction.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: signer.publicKey,
            weight: signer.weight,
          },
        }),
      );
    });
    transaction.addOperation(Operation.setOptions(options));
    const transactionTx = transaction.setTimeout(180).build();

    return transactionTx.toXDR();
  }

  async adminSwap({
    appSends,
    userSends,
    userSecretKey,
  }: {
    appSends: { asset: string; amount: number }[];
    userSends: { asset: string; amount: number }[];
    userSecretKey: string;
  }) {
    const { max = BASE_FEE } = await this.serverService.getFees();
    const account = await this.accountUtilsService.getAccount(this.payBy);

    const userPair = Keypair.fromSecret(userSecretKey);
    const swapTransaction = new TransactionBuilder(account, {
      fee: max,
      networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
    });

    for (const { asset, amount } of appSends) {
      const ASSET = getAssetCode(asset);
      const hasTrustline = await this.accountUtilsService.getBalances(userPair.publicKey(), ASSET.code);
      if (!hasTrustline && asset !== 'XLM') {
        const balances: any = await this.accountUtilsService.getBalances(userPair.publicKey());
        const xlm = parseFloat((balances.find((b) => b.asset_type === 'native') || { balance: 0 }).balance);
        const xlmUsed = (balances.filter((b) => b.asset_type !== 'native') || []).length * 0.6;
        if (xlm < xlmUsed + 2) {
          const sponsor = this.sponsorBy || this.payBy;
          swapTransaction.addOperation(
            Operation.payment({
              destination: userPair.publicKey(),
              asset: Asset.native(),
              amount: '0.5',
              source: sponsor,
            }),
          );
        }
        swapTransaction.addOperation(
          Operation.changeTrust({
            asset: ASSET,
            source: userPair.publicKey(),
          }),
        );
      }
      swapTransaction.addOperation(
        Operation.payment({
          destination: Keypair.fromSecret(userSecretKey).publicKey(),
          asset: ASSET,
          amount: amount.toString(),
        }),
      );
    }

    for (const { asset, amount } of userSends) {
      const ASSET = getAssetCode(asset);
      swapTransaction.addOperation(
        Operation.payment({
          destination: this.payBy,
          asset: ASSET,
          amount: amount.toString(),
          source: userPair.publicKey(),
        }),
      );
    }

    const transactionTx = swapTransaction.setTimeout(30).build();
    const [transactionSigned, validToSign] = await this.signersService.signTransaction(transactionTx, [userPair]);
    if (!validToSign) {
      return transactionSigned.toXDR();
    }

    await this.serverService.submitTransaction(transactionSigned);
    return transactionSigned.hash().toString('hex');
  }
}
