'use strict';

var Job = require('./Job');
var Thread = require('./Thread');

var utils = require('./utils');


/**
 *  @param {int} [size]       Optional. Number of threads. Default is `ThreadPool.defaultSize`.
 *  @param {string} [evalScriptUrl] Optional. URL to `evalWorker[.min].js` script (for IE compatibility).
 */
var ThreadPool = function (size, evalScriptUrl) {
  size = size || ThreadPool.defaultSize;
  evalScriptUrl = evalScriptUrl || '';

  this.size = size;
  this.evalWorkerUrl = evalScriptUrl;
  this.pendingJobs = [];
  this.idleThreads = [];
  this.activeThreads = [];

  this.callbacksDone = [];
  this.callbacksError = [];

  for (var i = 0; i < size; i++) {
    this.idleThreads.push( new Thread(this) );
  }
};

ThreadPool.prototype = {
  terminateAll: function() {
    for(var i = 0; i < this.idleThreads.length; i++) {
      this.idleThreads[i].terminate();
    }

    for(i = 0; i < this.activeThreads.length; i++) {
      if(this.activeThreads[i]) {
        this.activeThreads[i].terminate();
      }
    }
  },

  /**
   *  Usage: run ({string} WorkerScript [, {object|scalar} Parameter[, {object[]} BuffersToTransfer]] [, {function} doneCallback(returnValue)])
   *         - or -
   *         run ([{string[]} ImportScripts, ] {function} WorkerFunction(param, doneCB) [, {object|scalar} Parameter[, {objects[]} BuffersToTransfer]] [, {function} DoneCallback(result)])
   */
  run: function () {
    ////////////////////
    // Parse arguments:

    var args = [].slice.call(arguments);  // convert `arguments` to a fully functional array `args`
    var workerScript, workerFunction, importScripts, parameter, transferBuffers, doneCb;

    if (arguments.length < 1) {
      throw new Error('run(): Too few parameters.');
    }

    if (typeof args[0] === 'string') {
      // 1st usage example (see doc above)
      workerScript = args.shift();
    } else {
      // 2nd usage example (see doc above)
      if (typeof args[0] === 'object' && args[0] instanceof Array) {
        importScripts = args.shift();
      }
      if (args.length > 0 && typeof args[0] === 'function') {
        workerFunction = args.shift();
      } else {
        throw new Error('run(): Missing obligatory thread logic function.');
      }
    }

    if (args.length > 0 && typeof args[0] !== 'function') {
      parameter = args.shift();
    }
    if (args.length > 0 && typeof args[0] !== 'function') {
      transferBuffers = args.shift();
    }
    if (args.length > 0 && typeof args[0] === 'function') {
      doneCb = args.shift();
    }
    if (args.length > 0) {
      throw new Error('run(): Unrecognized parameters: ' + args);
    }

    ///////////////
    // Create job:

    var job;
    if (workerScript) {
      job = new Job(workerScript, parameter, transferBuffers);
    } else {
      job = new Job(workerFunction, parameter, transferBuffers);
      if (importScripts && importScripts.length > 0) {
        job.setImportScripts(importScripts);
      }
    }

    if (doneCb) {
      job.done(doneCb);
    }

    ////////////
    // Run job:

    this.pendingJobs.push(job);

    var self = this;
    setTimeout(function() {
      self.runJobs();
    }, 0);

    return job;
  },

  runJobs: function () {
    if (this.idleThreads.length > 0 && this.pendingJobs.length > 0) {
      var thread = this.idleThreads.shift();
      this.activeThreads.push(thread);
      var job = this.pendingJobs.shift();
      thread.run(job);
    }
  },

  onThreadDone: function (thread) {
    this.idleThreads.unshift(thread);
    this.activeThreads.splice(this.activeThreads.indexOf(thread), 1);
    this.runJobs();
  },

  triggerDone: function (result) {
    utils.callListeners(this.callbacksDone, [result]);
  },
  triggerError: function (error) {
    utils.callListeners(this.callbacksError, [error]);
  },

  clearDone: function() {
    this.callbacksDone = [];
  },

  /// @see Job.done()
  done: function(callback) {
    utils.addListener(this.callbacksDone, callback);
    return this;
  },
  /// @see Job.error()
  error: function(callback) {
    utils.addListener(this.callbacksError, callback);
    return this;
  }
};


//////////////////////
// Set default values:

ThreadPool.defaultSize = 8;


module.exports = ThreadPool;
