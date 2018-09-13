const io = require('socket.io-client');
const HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet');

const WINDOW = typeof window === 'object';
let root = WINDOW ? window : {};
const NODE_JS = typeof process === 'object' && process.versions && process.versions.node;
if (NODE_JS) {
  root = global;
}

const PROTOCOL = 'coolwallet';
const REQUEST_TIMEOUT = 120000;
const OPEN_TIMEOUT = 3000;

function addEventListener(target, event, handler) {
  if (target.addEventListener) {
    target.addEventListener(event, handler);
  } else {
    target.attachEvent('on' + event, handler);
  }
}

function removeEventListener(target, event, handler) {
  if (target.removeEventListener) {
    target.removeEventListener(event, handler);
  } else {
    target.detachEvent('on' + event, handler);
  }
}

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
  this.onBlur = this.onBlur.bind(this);
  this.session = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  this.socket = io(this.relayHost, { query: `session=${this.session}` });
  this.socket.on('message', this.onMessage.bind(this));
  if (WINDOW) {
    this.div = document.createElement('div');
    this.div.className = 'coolwallet-overlay';
    this.div.style.display = 'none';
    this.ok = document.createElement('a');
    this.ok.innerHTML = 'Open CoolWallet';
    this.ok.className = 'ok';
    this.ok.onclick = function () {
      this.openTimer = setTimeout(function () {
        this.cancel();
      }.bind(this), OPEN_TIMEOUT);
    }.bind(this);
    const cancel = document.createElement('a');
    cancel.innerHTML = 'Cancel';
    cancel.className = 'cancel';
    cancel.onclick = this.cancel.bind(this);
    cancel.href = 'javascript:;';
    this.div.appendChild(cancel);
    this.div.appendChild(this.ok);
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    document.body.appendChild(this.iframe);
    document.body.appendChild(this.div);
    addEventListener(window, 'blur', this.onBlur);
  }
}

CoolwalletProvider.prototype.onBlur = function () {
  clearTimeout(this.openTimer);
};

CoolwalletProvider.prototype.onMessage = function (message) {
  let job;
  try {
    message = JSON.parse(message);
    if (!message) {
      return;
    }
    job = this.requests[message.requestId];
    delete this.requests[message.requestId];
    this.socket.emit('recevied', message.requestId);
    if (!job) {
      return console.error('can not find request');
    }
    clearTimeout(job.timeout);
    if (message.error) {
      const error = new Error(message.result);
      error.code = message.error;
      job.callback(error, null);
    } else {
      if (job.params.action === 'signMessage') {
        message.result = `0x${message.result}`;
      }
      job.callback(null, message.result);
    }
  } catch (e) {
    console.log(e, message);
    if (job) {
      job.callback(e, null);
    }
  }
  this.processing = false;
  if (WINDOW) {
    this.div.style.display = 'none';
  }
  this.dequeue();
};

CoolwalletProvider.prototype.checkReady = function () {
  if (this.socket.connected) {
    return true;
  }
  this.socket.once('connect', function () {
    this.dequeue();
  }.bind(this));
};

CoolwalletProvider.prototype.getAccounts = function (callback) {
  if (this.accounts) {
    callback(null, [].concat(this.accounts));
  } else {
    const self = this;
    this.request('getAccounts', function (error, result) {
      if (!error) {
        self.accounts = result;
        if (WINDOW) {
          delete self.ok.onclick;
          removeEventListener(window, 'blur', this.onBlur);
        }
      }
      callback(error, result);
    });
  }
};

CoolwalletProvider.prototype.signMessage = function (message, callback) {
  if (typeof message.data === 'object') {
    message.raw = message.data.raw;
    message.data = message.data.data;
  }
  this.request('signMessage', callback, message);
};

CoolwalletProvider.prototype.signTransaction = function (tx, callback) {
  this.request('signTransaction', callback, tx);
};

CoolwalletProvider.prototype.request = function (action, callback, params) {
  const requestId = this.requestId++;
  params = params || {};
  params.action = action;
  const job = { requestId: requestId, callback: callback, params: params };
  this.requestQueues.push(job);
  this.dequeue();
};

CoolwalletProvider.prototype.dequeue = function () {
  if (this.processing || this.requestQueues.length === 0) {
    return;
  }
  if (!this.checkReady()) {
    return;
  }
  this.processing = true;
  const job = this.requestQueues.shift();
  if (job.params.action === 'getAccounts' && this.accounts) {
    this.processing = false;
    return job.callback(null, [].concat(this.accounts));
  }

  this.requests[job.requestId] = job;
  job.params.callback = this.createCallbackUrl(job.requestId);
  job.uri = this.createUri(job.params);
  job.timeout = setTimeout(function () {
    delete this.requests[job.requestId];
    this.processing = false;
    this.div.style.display = 'none';
    job.callback(new Error('request timeout'), null);
  }.bind(this), REQUEST_TIMEOUT);
  this.currentJob = job;
  if (root.COOLWALLET_PROVIDER_URI_HANDLER) {
    root.COOLWALLET_PROVIDER_URI_HANDLER(job);
  } else if (WINDOW) {
    // if (job.params.action === 'signTransaction') {
      this.ok.href = job.uri;
      this.div.style.display = 'block';
    // } else {
    //   this.iframe.src = job.uri;
    // }
  } else {
    console.error('not supported');
  }
};

CoolwalletProvider.prototype.createUri = function (params) {
  Object.assign(params, {
    apiKey: this.apiKey,
    source: this.source,
    t: Date.now()
  });
  const query = Object.keys(params).map(function (key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');
  return PROTOCOL + '://?' + query;
};

CoolwalletProvider.prototype.createCallbackUrl = function (requestId) {
  const joint = this.callbackUrl.indexOf('?') === -1 ? '?' : '&';
  return this.callbackUrl + joint + 'session=' + this.session + '&requestId=' + requestId;
};

CoolwalletProvider.prototype.stop = function () {
  this.cancel();
  if (this.socket) {
    this.socket.close();
    this.socket = null;
  }
  if (WINDOW) {
    document.body.removeChild(this.iframe);
    this.iframe = null;
  }
};

CoolwalletProvider.prototype.cancel = function () {
  if (!this.currentJob) {
    return;
  }
  const job = this.currentJob;
  delete this.requests[job.requestId];
  this.processing = false;
  job.callback(new Error('cancelled'), null);
  this.div.style.display = 'none';
};

function createCoolwalletProvider(options) {
  const collwalletProvider = new CoolwalletProvider(options);
  let timer;
  const startTimer = function (provider) {
    if (timer) {
      return;
    }
    timer = setInterval(function () {
      if (!provider.engine._blockTracker._isRunning) {
        clearInterval(timer);
        timer = null;
        collwalletProvider.stop();
      }
    }, 5000);
  };
  return new HookedWalletSubprovider({
    getAccounts: function (callback) {
      startTimer(this);
      collwalletProvider.getAccounts(callback);
    },
    signMessage: function(message, callback) {
      collwalletProvider.signMessage(message, callback);
    },
    signTransaction: function (tx, callback) {
      collwalletProvider.signTransaction(tx, callback);
    }
  });
}

module.exports = createCoolwalletProvider;
