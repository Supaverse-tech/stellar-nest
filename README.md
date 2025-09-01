# @supaverse/stellar-nest

> A lightweight and opinionated NestJS module for working with the Stellar blockchain.  
> 🧠 **Note:** While this library can be adapted to many use cases, it is primarily designed for **custodied account flows**.


---

## 🚀 Installation

```bash
npm install @supaverse/stellar-nest
```

This package is available via [npm](https://www.npmjs.com/package/@supaverse/stellar-nest).

---

## 🧪 Usage with NestJS

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StellarModule } from '@supaverse/stellar-nest';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StellarModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<'prod' | 'dev'>('app.environment');
        const stellar = config.get<IStellarConfig>('stellar');

        return {
          payments: {
            config: {
              create_by: 'ACCOUNT',
              pay_by: 'ACCOUNT',
              sponsor_by: 'ACCOUNT',
            },
          },
          account: {
            config: {
              create_by: 'ACCOUNT',
              starting: {
                homeDomain: 'supaverse.tech',
                balance: '1.5',
              },
            },
            accounts: [
              {
                public: stellar.master_account,
                type: 'ACCOUNT',
                secret: stellar.master_account_secret,
              },
            ],
          },
          mode: env === 'prod' ? 'PUBLIC' : 'TESTNET',
        };
      },
    }),
  ],
})
export class AppModule {}
```

---

## 🧩 Configuration examples

### 🔹 1. Simple configuration (one account does everything)

```ts
StellarModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const env = config.get<'prod' | 'dev'>('app.environment');
    const stellar = config.get<IStellarConfig>('stellar');

    return {
      payments: {
        config: {
          create_by: 'ACCOUNT',
          pay_by: 'ACCOUNT',
          sponsor_by: 'ACCOUNT',
        },
      },
      account: {
        config: {
          create_by: 'ACCOUNT',
          starting: {
            homeDomain: 'supaverse.tech',
            balance: '1.5',
          },
        },
        accounts: [
          {
            public: stellar.master_account,
            type: 'ACCOUNT',
            secret: stellar.master_account_secret,
          },
        ],
      },
      mode: env === 'prod' ? 'PUBLIC' : 'TESTNET',
    };
  },
});
```

### 🔹 2. Advanced configuration (multiple roles and signers)

```ts
StellarModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return {
      payments: {
        config: {
          create_by: 'ISSUER',
          pay_by: 'DISTRIBUTOR',
          sponsor_by: 'DISTRIBUTOR',
        },
      },
      account: {
        config: {
          create_by: 'DISTRIBUTOR',
          starting: {
            homeDomain: 'nauta.land',
            balance: '2',
            baseTrustline: [
              process.env.ENVIROMENT === 'prod' ? USDC.PUBLIC : USDC.TESTNET,
            ],
          },
        },
        accounts: [
          {
            public: config.get('STELLAR_ISSUER_PUBLIC'),
            type: 'ISSUER',
            signers: ['APP_SIGNER'],
          },
          {
            public: config.get('STELLAR_DISTRIBUTOR_PUBLIC'),
            type: 'DISTRIBUTOR',
            signers: ['APP_SIGNER'],
          },
          {
            secret: config.get('STELLAR_SECRET'),
            type: 'APP_SIGNER',
          },
        ],
      },
      mode: process.env.ENVIROMENT === 'prod' ? 'PUBLIC' : 'TESTNET',
    };
  },
});
```

> 💡 **Note:** The `type` field in each account is a user-defined alias.  
> You can use any string to identify the role or purpose of that account (e.g., `ISSUER`, `DISTRIBUTOR`, `APP_SIGNER`, `ACCOUNT`).  
> These aliases are used internally to define who performs actions like payment, sponsorship, or account creation.


---

## 🛠️ Additional Utilities

The module includes helpful utility methods and decorators for account handling, validation, and testing.

### 🔹 AccountService

- `createAccount()`  
Creates an account using the default configuration provided in the module setup.

- `getAccount(accountId: string)`  
Checks if the account ID is valid and returns the account from the Stellar network.

- `getBalances(accountId: string, assetCode?: string)`  
Returns the list of balances for an account. You can filter by asset code (e.g., `XLM`, `USDC`).

- `getPairFromSecret(secret: string)`  
Returns a `Keypair` instance from a given secret. Throws an error if invalid.

- `getAccountFromSecret(secret: string)`  
Returns a tuple `[Keypair, AccountResponse]` for a given secret key.

- `validateMemo(memo)`  
Returns a valid Stellar `Memo` object based on the input type: `string`, `number`, or `Uint8Array`.

- `validateAssetBalance(accountId: string, asset: Asset, amount: number)`  
Checks if the account has at least the specified amount of the given asset.

- `validateTransaction(transactionId: string)`  
Checks if the given transaction ID was successful on the Stellar network.

---

## 🎯 Decorators

These decorators simplify access to Stellar objects inside controller methods.

- `@BalanceParam(name, options?)`  
Injects a balance object from the request. Supports asset filtering.

- `@AccountParam(name, options?)`  
Injects an account object parsed from the request based on the given parameter name.

- `@CreateKeyPair()`  
Generates and injects a new random `Keypair`.

- `@CreateTestAccount()`  
Generates a funded testnet account using Stellar Friendbot (for development only).

---

## ⚠️ Disclaimer

This package is still under active development.  
It can be used in production environments **at your own risk** — please validate its behavior and fit with your use case before relying on it.

Feedback and pull requests are welcome!

---

## 📄 License

MIT — © Supaverse Tech
---