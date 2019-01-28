import ProviderEngine from 'web3-provider-engine';
import CacheSubprovider from 'web3-provider-engine/subproviders/cache.js';
import FixtureSubprovider from 'web3-provider-engine/subproviders/fixture.js';
import FilterSubprovider from 'web3-provider-engine/subproviders/filters.js';
import HookedWalletSubprovider from 'web3-provider-engine/subproviders/hooked-wallet.js';
import NonceSubprovider from 'web3-provider-engine/subproviders/nonce-tracker.js';
import SubscriptionsSubprovider from 'web3-provider-engine/subproviders/subscriptions.js';
import Penpal, { AsyncMethodReturns } from 'penpal';
import { networkAdapter } from './networks';
import { ISDKConfig, IConnectionMethods, INetwork, IOptions } from './interfaces';
import { getTxGas } from './utils/getTxGas';
import { Query } from './utils/query';
import { styles } from './styles';

const version = '$$PORTIS_SDK_VERSION$$';
const widgetUrl = 'https://widget.portis.io';

export default class Portis {
  config: ISDKConfig;
  widget: Promise<{
    communication: AsyncMethodReturns<IConnectionMethods>;
    iframe: HTMLIFrameElement;
    widgetFrame: HTMLDivElement;
  }>;
  provider;
  selectedAddress: string;
  private _widgetUrl = widgetUrl;
  private _onLoginCallback: (walletAddress: string, email?: string) => void;

  constructor(dappId: string, network: string | INetwork, options: IOptions = {}) {
    this._valiadateParams(dappId, network, options);
    this.config = { dappId, network: networkAdapter(network), version, scope: options.scope };
    this.widget = this._initWidget();
    this.provider = this._initProvider();
  }

  changeNetwork(network: string | INetwork) {
    this.config.network = networkAdapter(network);
  }

  setDefaultEmail(email: string) {
    this.config.defaultEmail = email;
  }

  async showPortis() {
    const widgetCommunication = (await this.widget).communication;
    return widgetCommunication.showPortis(this.config);
  }

  async login() {
    const widgetCommunication = (await this.widget).communication;
    return widgetCommunication.login(this.config);
  }

  onLogin(callback: (walletAddress: string, email?: string) => void) {
    this._onLoginCallback = callback;
  }

  private _valiadateParams(dappId: string, network: string | INetwork, options: IOptions) {
    if (!dappId) {
      throw new Error("[Portis] 'dappId' is required. Get your dappId here: https://dashboard.portis.io");
    }

    if (!network) {
      throw new Error(
        "[Portis] 'network' is required. Read more about it here: https://docs.portis.io/#/configuration?id=network",
      );
    }

    if (options.scope) {
      if (!Array.isArray(options.scope)) {
        throw new Error(
          "[Portis] 'scope' must be an array. Read more about it here: https://docs.portis.io/#/configuration?id=scope",
        );
      }

      const unknownScope = options.scope.filter(item => ['email'].indexOf(item) < 0);
      if (unknownScope.length > 0) {
        throw new Error(
          "[Portis] invalid 'scope' parameter. Read more about it here: https://docs.portis.io/#/configuration?id=scope",
        );
      }
    }
  }

  private _initWidget(): Promise<{
    communication: AsyncMethodReturns<IConnectionMethods>;
    iframe: HTMLIFrameElement;
    widgetFrame: HTMLDivElement;
  }> {
    return new Promise((resolve, reject) => {
      const onload = async () => {
        const style = document.createElement('style');
        style.innerHTML = styles;

        const container = document.createElement('div');
        container.className = 'por_portis-container';

        const widgetFrame = document.createElement('div');
        widgetFrame.id = `portis-container-${Date.now()}`;
        widgetFrame.className = 'por_portis-widget-frame';

        container.appendChild(widgetFrame);
        document.body.appendChild(container);
        document.head.appendChild(style);

        const connection = Penpal.connectToChild<IConnectionMethods>({
          url: this._widgetUrl,
          appendTo: document.getElementById(widgetFrame.id)!,
          methods: {
            setHeight: this._setHeight.bind(this),
            getWindowSize: this._getWindowSize.bind(this),
            onLogin: this._onLogin.bind(this),
          },
        });

        connection.iframe.style.position = 'absolute';
        connection.iframe.style.height = '100%';
        connection.iframe.style.width = '100%';
        connection.iframe.style.border = '0 transparent';

        const communication = await connection.promise;
        resolve({ communication, iframe: connection.iframe, widgetFrame });
      };

      if (['loaded', 'interactive', 'complete'].indexOf(document.readyState) > -1) {
        onload();
      } else {
        window.addEventListener('load', onload.bind(this), false);
      }
    });
  }

  private _initProvider() {
    const engine = new ProviderEngine();
    const query = new Query(engine);

    engine.send = (payload, callback) => {
      if (callback) {
        engine.sendAsync(payload, callback);
      } else {
        let result: any = null;
        switch (payload.method) {
          case 'eth_accounts':
            result = this.selectedAddress ? [this.selectedAddress] : [];
            break;

          case 'eth_coinbase':
            result = this.selectedAddress ? [this.selectedAddress] : [];
            break;

          case 'eth_uninstallFilter':
            engine.sendAsync(payload, _ => _);
            result = true;
            break;

          default:
            var message = `The Portis Web3 object does not support synchronous methods like ${
              payload.method
            } without a callback parameter.`;
            throw new Error(message);
        }

        return {
          id: payload.id,
          jsonrpc: payload.jsonrpc,
          result: result,
        };
      }
    };

    engine.addProvider(
      new FixtureSubprovider({
        web3_clientVersion: `Portis/v${this.config.version}/javascript`,
        net_listening: true,
        eth_hashrate: '0x00',
        eth_mining: false,
        eth_syncing: true,
      }),
    );

    engine.addProvider(new CacheSubprovider());
    engine.addProvider(new SubscriptionsSubprovider());
    engine.addProvider(new FilterSubprovider());
    engine.addProvider(new NonceSubprovider());

    engine.addProvider(
      new HookedWalletSubprovider({
        getAccounts: async cb => {
          const widgetCommunication = (await this.widget).communication;
          const { error, result } = await widgetCommunication.getAccounts(this.config);
          if (!error && result) {
            this.selectedAddress = result[0];
          }
          cb(error, result);
        },
        signTransaction: async (txParams, cb) => {
          const widgetCommunication = (await this.widget).communication;
          const { error, result } = await widgetCommunication.signTransaction(txParams, this.config);
          cb(error, result);
        },
        signMessage: async (msgParams, cb) => {
          const widgetCommunication = (await this.widget).communication;
          const params = Object.assign({}, msgParams, { messageStandard: 'signMessage' });
          const { error, result } = await widgetCommunication.signMessage(params, this.config);
          cb(error, result);
        },
        signPersonalMessage: async (msgParams, cb) => {
          const widgetCommunication = (await this.widget).communication;
          const params = Object.assign({}, msgParams, { messageStandard: 'signPersonalMessage' });
          const { error, result } = await widgetCommunication.signMessage(params, this.config);
          cb(error, result);
        },
        signTypedMessage: async (msgParams, cb) => {
          const widgetCommunication = (await this.widget).communication;
          const params = Object.assign({}, msgParams, { messageStandard: 'signTypedMessage' });
          const { error, result } = await widgetCommunication.signMessage(params, this.config);
          cb(error, result);
        },
        estimateGas: async (txParams, cb) => {
          const gas = await getTxGas(query, txParams);
          cb(null, gas);
        },
        gasPrice: async cb => {
          cb(null, { result: '' });
        },
      }),
    );

    engine.addProvider({
      setEngine: _ => _,
      handleRequest: async (payload, next, end) => {
        const widgetCommunication = (await this.widget).communication;
        const { error, result } = await widgetCommunication.relay(payload, this.config);
        end(error, result);
      },
    });

    engine.enable = () =>
      new Promise((resolve, reject) => {
        engine.sendAsync({ method: 'eth_accounts' }, (error, response) => {
          if (error) {
            reject(error);
          } else {
            resolve(response.result);
          }
        });
      });

    engine.start();
    return engine;
  }

  private async _setHeight(height: number) {
    const widgetFrame = (await this.widget).widgetFrame;
    widgetFrame.style.height = `${height}px`;
  }

  private _getWindowSize() {
    const body = document.getElementsByTagName('body')[0];
    const width = window.innerWidth || document.documentElement.clientWidth || body.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight || body.clientHeight;
    return { width, height };
  }

  private _onLogin(walletAddress: string, email?: string) {
    if (this._onLoginCallback) {
      this._onLoginCallback(walletAddress, email);
    }
  }
}