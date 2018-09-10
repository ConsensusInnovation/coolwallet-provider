const qs = require('qs');
const request = require('request');
const Web3 = require('web3');
const ProviderEngine = require('web3-provider-engine');
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
const createCoolwalletProvider = require('../src/coolwallet-provider');

const engine = new ProviderEngine();
const web3 = new Web3(engine);

engine.addProvider(createCoolwalletProvider({
  apiKey: 'apiKey',
  source: 'JOYSO',
  callbackUrl: 'http://localhost:8888/',
  relayHost: 'ws://localhost:8888/'
}));

engine.addProvider(new RpcSubprovider({ rpcUrl: 'https://ropsten.infura.io/EzVXM6CfAPpr5ytQ9v9c' }));

engine.start();

global.COOLWALLET_PROVIDER_URI_HANDLER = (job) => {
  const uri = job.uri;
  console.log(uri);
  const query = uri.split('?')[1];
  const params = qs.parse(query);
  let message;
  switch (params.action) {
    case 'getAccounts':
      message = {
        error: null,
        result: ['0x212b1B5aFa70e74E461a7eBF7f17d85A465d3394']
      };
      break;
    case 'signMessage':
      message = {
        error: null,
        result: '0x50d7441ad2e08c07cf296ea4bddee7c6930a0e593bb5a4cacd1901cb902f61787e28cfd4e112d0f944e107c066118e52999525cb964a2e6648fc399dadd3de901b'
      };
      break;
    case 'signTransaction':
      message = {
        error: '12345',
        result: 'gas price is too low'
      };
      // message = {
      //   error: null,
      //   result: '0xadc6b8bd10a9fa31594722bea9961530027a4929bbd97edaf966525a8297f584'
      // };
      break;
  }
  request.post(params.callback, { json: message }, (error, response, body) => {
    if (error) {
      console.log(error);
    }
  });
};

web3.eth.getAccounts((error, result) => {
  console.log(error, result);
});

web3.eth.sign('0x212b1B5aFa70e74E461a7eBF7f17d85A465d3394', { data: '0x1234', raw: 'plain' }, (error, result) => {
  console.log(error, result);
});

web3.eth.sendTransaction({
  from: '0x212b1B5aFa70e74E461a7eBF7f17d85A465d3394',
  to: '0x7037734b180c44b7041a31666486f81f45860541',
  value: '1000000000000000000',
  gas: 21000,
  gasPrice: 4000000000,
  data: '0x1234'
}, (error, result) => {
  console.log(error, result);
});
