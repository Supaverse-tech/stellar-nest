import { Servers } from './../enums';
import { Inject, Injectable } from '@nestjs/common';
import { STELLAR_OPTIONS } from '../constants';
import { StellarModuleConfig } from '../types';
import { Horizon } from '@stellar/stellar-sdk';
import { StellarModuleMode } from '../enums';

@Injectable()
export class ServerService extends Horizon.Server {
  private serverOptions: StellarModuleConfig['server'];
  public server: Horizon.Server;
  constructor(@Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig) {
    super(Servers[options.mode || StellarModuleMode.TESTNET]);
    this.serverOptions = this.options.server || null;
  }
  public async FriendBot(accountId: string) {
    return await fetch(`https://friendbot.stellar.org?addr=${accountId}`);
  }
  public async getFees() {
    const feeStats = await this.feeStats();
    const fees = {
      max: feeStats.max_fee.mode,
      base: feeStats.fee_charged.mode,
    };
    return fees;
  }
}
