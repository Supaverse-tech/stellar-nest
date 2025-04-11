import { Inject, Injectable } from '@nestjs/common';
import { Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { INVALID_ACCOUNT_TYPE, STELLAR_OPTIONS } from '../../constants';
import { StellarModuleConfig } from '../../types';

import { ServerService } from '../server.service';
import { StellarModuleMode } from '../../enums';
import { AccountUtilsService } from './account-utils.service';
import { SignersService } from '../signers.service';
import { getAssetCode } from '../../utils/getAssetCode';

@Injectable()
export class AccountService {
  private accountOptions: StellarModuleConfig['account']['config'];
  private mainAccounts: StellarModuleConfig['account']['accounts'];
  private accountsTypes: string[];
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly serverService: ServerService,
    private readonly accountUtilsService: AccountUtilsService,
    private readonly signersService: SignersService,
  ) {
    this.accountOptions = this.options.account.config;
    this.mainAccounts = this.options.account.accounts || [];
    this.accountsTypes = this.mainAccounts.map((a) => a.type);
  }
  private validateAccountType(): void {
    if (!this.accountsTypes.includes(this.accountOptions.create_by)) {
      throw new Error(
        `${INVALID_ACCOUNT_TYPE} valid types are [${this.accountsTypes.join(', ')}] not ${this.accountOptions.create_by}`,
      );
    }
    return;
  }

  public async createDemoAccount(): Promise<Keypair> {
    const newPair = Keypair.random();

    if (this.options.mode === StellarModuleMode.TESTNET) {
      await this.serverService.FriendBot(newPair.publicKey()).catch((e) => e);
    }

    return newPair;
  }

  public async createAccount({ secret, trustline }: { secret?: string; trustline?: string }): Promise<Keypair> {
    const newPair = Keypair.random();

    this.validateAccountType();
    const { base = BASE_FEE } = await this.serverService.getFees();
    const keyPair = secret
      ? Keypair.fromSecret(secret)
      : Keypair.fromPublicKey(this.mainAccounts.find((a) => a.type === this.accountOptions.create_by)?.public);
    const account = await this.accountUtilsService.getAccount(keyPair.publicKey());

    const createAccountTx = new TransactionBuilder(account, {
      fee: base,
      networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
    }).addOperation(
      Operation.createAccount({
        destination: newPair.publicKey(),
        startingBalance: this.accountOptions.starting?.balance || '1',
      }),
    );

    if (this.accountOptions.starting?.homeDomain) {
      createAccountTx.addOperation(
        Operation.setOptions({
          homeDomain: this.accountOptions.starting.homeDomain,
          source: newPair.publicKey(),
        }),
      );
    }

    if (this.accountOptions.starting?.baseTrustline) {
      const trustlines = this.accountOptions.starting.baseTrustline.map((t) => {
        if (typeof t === 'string') return t.split(':');
        return t[this.options.mode || StellarModuleMode.TESTNET].split(':');
      });
      trustlines.forEach((t: [string, string]) => {
        createAccountTx.addOperation(
          Operation.changeTrust({
            asset: new Asset(...t),
            source: newPair.publicKey(),
          }),
        );
      });
    }

    if (trustline) {
      const ASSET = getAssetCode(trustline);
      createAccountTx.addOperation(
        Operation.changeTrust({
          asset: ASSET,
          source: newPair.publicKey(),
        }),
      );
    }

    const transactionTx = createAccountTx.setTimeout(180).build();
    const [transaction] = await this.signersService.signTransaction(transactionTx, [
      newPair,
      ...(secret ? [keyPair] : []),
    ]);
    await this.serverService.submitTransaction(transaction).catch((e) => e);

    return newPair;
  }

  public async deleteAccount(secret: string) {
    if (!this.accountOptions?.create_by) {
      throw new Error('Se debe mandar a alguna cuenta');
    }
    const [keypair, account] = await this.accountUtilsService.getAccountFromSecret(secret);
    const destination = this.mainAccounts.find((a) => a.type === this.options.account.config.create_by)?.public;
    const { base = BASE_FEE } = await this.serverService.getFees();
    const transaction = new TransactionBuilder(account, {
      fee: base,
      networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
    });

    account.balances.forEach((asset: any) => {
      if (asset.asset_type !== 'native') {
        if (parseFloat(asset.balance) !== 0) {
          transaction.addOperation(
            Operation.payment({
              destination,
              asset: new Asset(asset.asset_code, asset.asset_issuer),
              amount: asset.balance,
            }),
          );
        }
        transaction.addOperation(
          Operation.changeTrust({
            asset: new Asset(asset.asset_code, asset.asset_issuer),
            limit: '0',
          }),
        );
      }
    });

    transaction.addOperation(
      Operation.accountMerge({
        destination,
      }),
    );

    const transactionTx = transaction.setTimeout(30).build();
    transactionTx.sign(keypair);
    await this.serverService.submitTransaction(transactionTx).catch((e) => e);
  }
  public async validateTrustLine(asset: string, wallet: { publicKey: string; secret: string }) {
    const ASSET = getAssetCode(asset);
    const [keypair, masterAccount] = await this.accountUtilsService.getAccountFromSecret(
      this.mainAccounts.find((a) => a.type === this.accountOptions.create_by)?.secret,
    );
    const balance = (await this.accountUtilsService.getBalances(wallet.publicKey)) as any[];
    const hasTrustline = balance.find((b) => b.asset_code === ASSET.code);
    if (!hasTrustline) {
      const changeTrustTx = new TransactionBuilder(masterAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks[this.options.mode || StellarModuleMode.TESTNET],
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset(
              balance.find((b) => b.asset_type !== 'native')?.asset_code,
              balance.find((b) => b.asset_type !== 'native')?.asset_issuer,
            ),
            source: wallet.publicKey,
            limit: '0',
          }),
        )
        .addOperation(
          Operation.changeTrust({
            asset: ASSET,
            source: wallet.publicKey,
          }),
        );
      const transactionTx = changeTrustTx.setTimeout(180).build();
      const [transaction] = await this.signersService.signTransaction(transactionTx, [
        keypair,
        Keypair.fromSecret(wallet.secret),
      ]);
      try {
        await this.serverService.submitTransaction(transaction);
      } catch (e) {
        console.log(e.response.data.extras);

        return e.response.data;
      }
      return true;
    }
    return true;
  }
}
