import { Inject, Injectable } from '@nestjs/common';
import { Keypair, Transaction } from '@stellar/stellar-sdk';

import { STELLAR_OPTIONS } from '../constants';
import { StellarModuleConfig } from '../types';
import { AccountUtilsService } from './account/account-utils.service';
import { OPERATION_THRESHOLD } from '../enums';

@Injectable()
export class SignersService {
  private mainAccounts: StellarModuleConfig['account']['accounts'];
  constructor(
    @Inject(STELLAR_OPTIONS) private readonly options: StellarModuleConfig,
    private readonly accountUtilsService: AccountUtilsService,
  ) {
    this.mainAccounts = this.options.account.accounts || [];
  }

  public async getRequiredSigners(
    transaction: Transaction,
    extraSigners?: Keypair[],
  ) {
    const signers = new Set<string>();
    let validSigners = true;
    for (const operation of transaction.operations) {
      const source = operation.source || transaction.source;
      const ownerAccount = this.mainAccounts.find(
        (account) => account.public === source,
      );
      if (!ownerAccount) continue;
      const stellarAccount = await this.accountUtilsService.getAccount(
        ownerAccount?.public,
      );
      const { thresholds, signers: stellarSigners } = stellarAccount;
      const thresholdNeeded = OPERATION_THRESHOLD[operation.type];
      if (ownerAccount?.signers) {
        for (const signer of ownerAccount.signers) {
          const _signer = this.mainAccounts.find((a) => a.type === signer);
          const signerAccount = stellarSigners.find(
            (a) => a.key === Keypair.fromSecret(_signer.secret).publicKey(),
          );
          if (signerAccount.weight < thresholds[thresholdNeeded]) {
            validSigners = false;
            continue;
          }
          signers.add(_signer.secret);
        }
      }
      if (ownerAccount.secret) {
        signers.add(ownerAccount.secret);
      }
    }

    if (extraSigners) {
      extraSigners.forEach((keypair) => {
        const isAlreadySigner = [...signers].some(
          (secret) => secret === keypair.secret(),
        );
        if (!isAlreadySigner) {
          const signerIsNeeded = transaction.operations.some((operation) => {
            return (
              operation.source === keypair.publicKey() ||
              transaction.source === keypair.publicKey()
            );
          });

          if (signerIsNeeded) {
            signers.add(keypair.secret());
          }
        }
      });
    }
    return {
      signers: [
        ...Array.from(signers).map((secret) => Keypair.fromSecret(secret)),
      ],
      validSigners,
    };
  }

  public async signTransaction(
    transaction: Transaction,
    extraSigners?: Keypair[],
  ): Promise<[Transaction, boolean]> {
    const { signers, validSigners } = await this.getRequiredSigners(
      transaction,
      extraSigners,
    );
    signers.forEach((signer) => transaction.sign(signer));
    return [transaction, validSigners];
  }
}
