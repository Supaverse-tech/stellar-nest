import { Inject, Injectable } from '@nestjs/common';
import { ServerService } from '../server.service';
import { Asset, Memo } from '@stellar/stellar-sdk';
import { AccountUtilsService } from '../account/account-utils.service';
import { STELLAR_OPTIONS } from '../../constants';
import { StellarModuleConfig } from '../../types';

@Injectable()
export class PaymentUtilsService {
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly serverService: ServerService,
    private readonly accountUtilsService: AccountUtilsService,
  ) {}
  public validateMemo(memo: string | number | Uint8Array) {
    if (typeof memo === 'string') return Memo.text(memo);
    if (typeof memo === 'number') return Memo.id(memo.toString());
    if (memo instanceof Uint8Array && memo.length === 32) return Memo.hash(Buffer.from(memo));
    if (memo instanceof Uint8Array) return Memo.return(Buffer.from(memo).toString('base64'));
    throw new Error('Invalid memo');
  }
  public async validateAssetBalance(from: string, asset: Asset, amount: number) {
    const balance = await this.accountUtilsService.getBalances(from, asset.code);
    const floatAmout = parseFloat((balance as { balance: string })?.balance || '0');
    return floatAmout >= amount;
  }
  public async validateTransaction(id: string) {
    try {
      const transaction = await this.serverService.transactions().transaction(id).call();
      return !!transaction?.successful;
    } catch (_) {
      return false;
    }
  }
}
