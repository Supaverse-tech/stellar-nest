import { DynamicModule, Global, InjectionToken, Module, Provider } from '@nestjs/common';
import * as stellarProviders from './providers';
import { StellarAsyncModuleConfig, StellarModuleConfig } from './types';
import { STELLAR_OPTIONS } from './constants';

@Global()
@Module({})
export class StellarModule {
  static forRoot(ops: StellarModuleConfig): DynamicModule {
    const providers: Provider[] = [
      {
        provide: STELLAR_OPTIONS,
        useValue: ops,
      },
      ...Object.values(stellarProviders),
    ];
    return {
      module: StellarModule,
      exports: providers,
      providers,
    };
  }
  static forRootAsync(ops: StellarAsyncModuleConfig<StellarModuleConfig>): DynamicModule {
    const configProvider = this.createAsyncProvider<StellarModuleConfig>(STELLAR_OPTIONS, ops);
    const providers = [...configProvider, ...Object.values(stellarProviders)];
    return {
      imports: ops.imports || [],
      module: StellarModule,
      exports: providers,
      providers,
    };
  }
  private static createAsyncProvider<T>(token: InjectionToken, ops: StellarAsyncModuleConfig<T>): Provider[] {
    return [
      {
        provide: token,
        useFactory: ops.useFactory,
        inject: ops.inject || [],
      },
    ];
  }
}
