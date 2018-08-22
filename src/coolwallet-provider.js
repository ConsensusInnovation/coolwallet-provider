(function () {
  var WINDOW = typeof window === 'object';
  var root = WINDOW ? window : {};
  var WEB_WORKER = !WINDOW && typeof self === 'object';
  var NODE_JS = typeof process === 'object' && process.versions && process.versions.node;
  if (NODE_JS) {
    root = global;
  } else if (WEB_WORKER) {
    root = self;
  }
  var COMMON_JS = typeof module === 'object' && module.exports;

  var PROTOCOL = 'coolwallet';

  function CoolwalletProvider(options) {
    options = options || {};
    this.apiKey = options.apiKey || '';
    this.source = options.source || '';
    this.callbackUrl = options.callbackUrl || '';
    this.relayHost = options.relayHost || '';
    this.requestId = new Date().getTime();
    this.requests = {};
    this.requestQueues = [];
    this.processing = false;

    this.getAccounts = this.getAccounts.bind(this);
    this.signMessage = this.signMessage.bind(this);
    this.signTransaction = this.signTransaction.bind(this);

    var io = this.getIo();
    if (io) {
      this.socket = io(this.relayHost);
      this.socket.on('message', this.onMessage.bind(this));
    } else {
      console.error('can not find socket.io library.');
    }
  }

  CoolwalletProvider.prototype.getIo = function () {
    if (COMMON_JS) {
      return require('socket.io-client');
    } else {
      return root.io;
    }
  };

  CoolwalletProvider.prototype.onMessage = function (message) {
    try {
      message = JSON.parse(message);
      var job = this.requests[message.requestId];
      delete this.requests[message.requestId];
      if (!job) {
        return console.error('can not find request');
      }
      clearTimeout(job.timeout);
      if (message.error) {
        job.callback(new Error(message.error), message.result);
      } else {
        job.callback(null, message.result);
      }
    } catch (e) {
      console.log(e, message);
    }
    this.processing = false;
    this.dequeue();
  };

  CoolwalletProvider.prototype.getAccounts = function (callback) {
    if (this.accounts) {
      callback(null, [].concat(this.accounts));
    } else {
      var self = this;
      this.request('getAccounts', function (error, result) {
        if (!error) {
          self.accounts = result;
        }
        callback(error, result)
      });
    }
  };

  CoolwalletProvider.prototype.signMessage = function (message, callback) {
    this.request('signMessage', callback, message);
  };

  CoolwalletProvider.prototype.signTransaction = function (tx, callback) {
    this.request('signTransaction', callback, tx);
  };

  CoolwalletProvider.prototype.request = function (action, callback, params) {
    var requestId = this.requestId++;
    params = params || {};
    params.action = action;
    var job = { requestId: requestId, callback: callback, params: params };
    this.requestQueues.push(job);
    this.dequeue();
  };

  CoolwalletProvider.prototype.dequeue = function () {
    if (this.processing || this.requestQueues.length === 0) {
      return;
    }
    this.processing = true;
    var job = this.requestQueues.shift();
    if (job.params.action === 'getAccounts' && this.accounts) {
      this.processing = false;
      return job.callback(null, [].concat(this.accounts));
    }

    this.requests[job.requestId] = job;
    job.params.callback = this.createCallbackUrl(job.requestId);
    job.uri = this.createUri(job.params);
    var self = this;
    job.timeout = setTimeout(function () {
      delete self.requests[job.requestId];
      callback(new Error('request timeout'), null);
    }, 15000);
    if (root.COOLWALLET_PROVIDER_URI_HANDLER) {
      root.COOLWALLET_PROVIDER_URI_HANDLER(job);
    } else if (WINDOW) {
      window.open(job.uri);
    } else {
      console.error('not supported');
    }
  };

  CoolwalletProvider.prototype.createUri = function (params) {
    Object.assign(params, {
      apiKey: this.apiKey,
      source: this.source
    });
    var query = Object.keys(params).map(function (key) {
      return key + '=' + encodeURIComponent(params[key]);
    }).join('&');
    return PROTOCOL + '://?' + query;
  };

  CoolwalletProvider.prototype.createCallbackUrl = function (requestId) {
    var joint = this.callbackUrl.indexOf('?') === -1 ? '?' : '&';
    return this.callbackUrl + joint + 'session=' + this.socket.id + '&requestId=' + requestId;
  };

  if (COMMON_JS) {
    module.exports = CoolwalletProvider;
  } else {
    root.CoolwalletProvider = CoolwalletProvider;
    if (AMD) {
      define(function () {
        return CoolwalletProvider;
      });
    }
  }
})();
