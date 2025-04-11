import { Injectable } from '@nestjs/common';
import { ServerService } from '../server.service';
import { Keypair } from '@stellar/stellar-sdk';
import { INVALID_SECRET } from '../../constants';
import { AccountResponse } from '@stellar/stellar-sdk/lib/horizon';


@Injectable()
export class AccountUtilsService {
  constructor(private readonly serverService: ServerService) {}
  public isValidAccount(accountId: string) {
    try {
      Keypair.fromPublicKey(accountId);
      return true;
    } catch (e) {
      return e;
    }
  }

  public async getAccount(accountId: string) {
    const isValid = this.isValidAccount(accountId);
    return isValid ? await this.serverService.loadAccount(accountId) : null;
  }

  public async getBalances(accountId: string, assetCode?: string) {
    const account = await this.getAccount(accountId);
    if (!assetCode) return account.balances;
    return account.balances.find((b: any) =>
      assetCode === 'XLM'
        ? b.asset_type === 'native'
        : b.asset_code === assetCode,
    );
  }

  public getPairFromSecret(secret: string) {
    try {
      return Keypair.fromSecret(secret);
    } catch (_) {
      throw new Error(INVALID_SECRET);
    }
  }

  public async getAccountFromSecret(
    secret: string,
  ): Promise<[Keypair, AccountResponse]> {
    const pair = this.getPairFromSecret(secret);
    return [pair, await this.getAccount(pair.publicKey())];
  }
}

