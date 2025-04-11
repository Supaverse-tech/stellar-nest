import { Inject, Injectable } from '@nestjs/common';
import { StellarModuleConfig } from '../../types';
import { STELLAR_OPTIONS } from '../../constants';
import { ServerService } from '../server.service';
import { SignersService } from '../signers.service';
import { AssetsUtilsService } from './assets-utils.service';
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { AccountUtilsService } from '../account/account-utils.service';
import { StellarModuleMode } from '../../enums';

@Injectable()
export class AssetsService {
  private assetConfig: StellarModuleConfig['payments']['config'];
  private mainAccounts: StellarModuleConfig['account']['accounts'];
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly assetsUtilsService: AssetsUtilsService,
    private readonly accountUtilsService: AccountUtilsService,
    private readonly serverService: ServerService,
    private readonly signersService: SignersService,
  ) {
    this.assetConfig = this.options.payments.config;
    this.mainAccounts = this.options.account.accounts || [];
  }
  public async createAsset({ assetName, amount }: { assetName: string; amount: number }, issuer?: string) {
    try {
      const { base = BASE_FEE } = await this.serverService.getFees();
      const ASSET_ISSUER = issuer || this.mainAccounts.find((a) => a.type === this.assetConfig.create_by)?.public;
      const sourceAccount = await this.accountUtilsService.getAccount(ASSET_ISSUER);
      if (await this.assetsUtilsService.doesAssetExist(assetName, ASSET_ISSUER)) {
        throw new Error(`Asset ${assetName} already exists`);
      }
      const asset = new Asset(assetName, ASSET_ISSUER);
      const createAssetTx = new TransactionBuilder(sourceAccount, {
        fee: base,
        networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
      })
        .addOperation(
          Operation.setOptions({
            setFlags: AuthRevocableFlag,
          }),
        )
        .addOperation(
          Operation.setOptions({
            setFlags: AuthClawbackEnabledFlag,
          }),
        );

      if (this.assetConfig.pay_by && this.assetConfig.pay_by !== this.assetConfig.create_by) {
        const DISTRIBUTOR_PUBLIC = this.mainAccounts.find((a) => a.type === this.assetConfig.pay_by).public;
        createAssetTx
          .addOperation(
            Operation.changeTrust({
              asset,
              source: DISTRIBUTOR_PUBLIC,
            }),
          )
          .addOperation(
            Operation.payment({
              destination: DISTRIBUTOR_PUBLIC,
              asset,
              amount: amount.toString(),
            }),
          );
      }
      const transactionTx = createAssetTx.setTimeout(300).build();
      const [transactionSigned, validToSign] = await this.signersService.signTransaction(transactionTx);
      if (!validToSign) {
        return transactionSigned.toXDR();
      }
      await this.serverService.submitTransaction(transactionSigned);
      return transactionSigned.hash().toString('hex');
    } catch (e) {
      return e;
    }
  }
  public async clawbackAsset(publicKey: string, assetName: string, amount: string) {
    try {
      const ISSUER = this.mainAccounts.find((a) => a.type === this.assetConfig.create_by)?.public;
      const issuerAccount = await this.accountUtilsService.getAccount(ISSUER);
      const { max = BASE_FEE } = await this.serverService.getFees();
      const asset = new Asset(assetName, ISSUER);
      const clawbackTx = new TransactionBuilder(issuerAccount, {
        fee: max,
        networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
      })
        .addOperation(
          Operation.clawback({
            asset,
            from: publicKey,
            amount,
          }),
        )
        .setTimeout(180)
        .build();

      const [transactionSigned, validToSign] = await this.signersService.signTransaction(clawbackTx);
      if (!validToSign) {
        return clawbackTx.toXDR();
      }
      const response = await this.serverService.submitTransaction(transactionSigned).catch((e) => e);

      return response;
    } catch (e) {
      return e;
    }
  }

  public async clawbackAllAsset(assetName: string) {
    const ISSUER = this.mainAccounts.find((a) => a.type === this.assetConfig.create_by)?.public;
    const issuerAccount = await this.accountUtilsService.getAccount(ISSUER);

    const { max = BASE_FEE } = await this.serverService.getFees();
    const asset = new Asset(assetName, ISSUER);
    let moreAccounts = true;
    let transactions = [];
    const limit = 1;
    let token = '0';
    while (moreAccounts) {
      const accounts = await this.serverService.accounts().forAsset(asset).limit(limit).cursor(token).call();
      if (!accounts.records.length) {
        return { message: 'No accounts found' };
      }

      token = accounts.records[accounts.records.length - 1].paging_token;
      const clawbackTx = new TransactionBuilder(issuerAccount, {
        fee: max,
        networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
      });

      for (const account of accounts.records) {
        const balance = account.balances.find((b) => (b as any).asset_code === assetName)?.balance;
        if (!balance || parseFloat(balance) === 0) {
          continue;
        }
        clawbackTx.addOperation(
          Operation.clawback({
            asset,
            from: account.account_id,
            amount: balance,
          }),
        );
      }

      const finalTransaction = clawbackTx.setTimeout(300).build();
      const [, validToSign] = await this.signersService.signTransaction(finalTransaction);
      if (!validToSign) {
        transactions = [...transactions, finalTransaction.toXDR()];
      }
      const extraAccounts = await accounts.next();
      if (!extraAccounts?.records?.length) moreAccounts = false;
    }

    return transactions;
  }
}
