import { window, document, setTimeout } from './globals';

import equiv from './equiv';
import dump from './dump';
import { runSuite, module } from './module';
import Assert from './assert';
import Logger from './logger';
import Test, { test, pushFailure } from './test';
import exportQUnit from './export';
import reporters from './reporters';

import config from './core/config';
import hooks from './core/hooks';
import { extend, objectType, is, performance } from './core/utilities';
import { registerLoggingCallbacks, runLoggingCallbacks } from './core/logging';
import { sourceFromStacktrace } from './core/stacktrace';
import ProcessingQueue from './core/processing-queue';

import { on, emit } from './events';
import onWindowError from './core/onerror';
import onUncaughtException from './core/on-uncaught-exception';

const QUnit = {};

// The "currentModule" object would ideally be defined using the createModule()
// function. Since it isn't, add the missing suiteReport property to it now that
// we have loaded all source code required to do so.
//
// TODO: Consider defining currentModule in core.js or module.js in its entirely
// rather than partly in config.js and partly here.
config.currentModule.suiteReport = runSuite;

let globalStartCalled = false;
let runStarted = false;

// Figure out if we're running the tests from a server or not
QUnit.isLocal = (window && window.location && window.location.protocol === 'file:');

// Expose the current QUnit version
QUnit.version = '@VERSION';

extend(QUnit, {
  config,

  dump,
  equiv,
  reporters,
  hooks,
  is,
  objectType,
  on,
  onError: onWindowError,
  onUncaughtException,
  pushFailure,

  assert: Assert.prototype,
  module,
  test,

  // alias other test flavors for easy access
  todo: test.todo,
  skip: test.skip,
  only: test.only,

  start: function (count) {
    if (config.current) {
      throw new Error('QUnit.start cannot be called inside a test context.');
    }

    const globalStartAlreadyCalled = globalStartCalled;
    globalStartCalled = true;

    if (runStarted) {
      throw new Error('Called start() while test already started running');
    }
    if (globalStartAlreadyCalled || count > 1) {
      throw new Error('Called start() outside of a test context too many times');
    }
    if (config.autostart) {
      throw new Error('Called start() outside of a test context when ' +
        'QUnit.config.autostart was true');
    }

    if (!config.pageLoaded) {
      // The page isn't completely loaded yet, so we set autostart and then
      // load if we're in Node or wait for the browser's load event.
      config.autostart = true;

      // Starts from Node even if .load was not previously called. We still return
      // early otherwise we'll wind up "beginning" twice.
      if (!document) {
        QUnit.load();
      }

      return;
    }

    scheduleBegin();
  },

  onUnhandledRejection: function (reason) {
    Logger.warn('QUnit.onUnhandledRejection is deprecated and will be removed in QUnit 3.0.' +
      ' Please use QUnit.onUncaughtException instead.');
    onUncaughtException(reason);
  },

  extend: function (...args) {
    Logger.warn('QUnit.extend is deprecated and will be removed in QUnit 3.0.' +
      ' Please use Object.assign instead.');

    // delegate to utility implementation, which does not warn and can be used elsewhere internally
    return extend.apply(this, args);
  },

  load: function () {
    config.pageLoaded = true;

    // Initialize the configuration options
    extend(config, {
      started: 0,
      updateRate: 1000,
      autostart: true,
      filter: ''
    }, true);

    if (!runStarted) {
      config.blocking = false;

      if (config.autostart) {
        scheduleBegin();
      }
    }
  },

  stack: function (offset) {
    offset = (offset || 0) + 2;
    return sourceFromStacktrace(offset);
  }
});

registerLoggingCallbacks(QUnit);

function scheduleBegin () {
  runStarted = true;

  // Add a slight delay to allow definition of more modules and tests.
  if (setTimeout) {
    setTimeout(function () {
      begin();
    });
  } else {
    begin();
  }
}

function unblockAndAdvanceQueue () {
  config.blocking = false;
  ProcessingQueue.advance();
}

export function begin () {
  if (config.started) {
    unblockAndAdvanceQueue();
    return;
  }

  // The test run hasn't officially begun yet
  // Record the time of the test run's beginning
  config.started = performance.now();

  // Delete the loose unnamed module if unused.
  if (config.modules[0].name === '' && config.modules[0].tests.length === 0) {
    config.modules.shift();
  }

  const modulesLog = [];
  for (let i = 0; i < config.modules.length; i++) {
    // Don't expose the unnamed global test module to plugins.
    if (config.modules[i].name !== '') {
      modulesLog.push({
        name: config.modules[i].name,
        moduleId: config.modules[i].moduleId,

        // Added in QUnit 1.16.0 for internal use by html-reporter,
        // but no longer used since QUnit 2.7.0.
        // @deprecated Kept unofficially to be removed in QUnit 3.0.
        tests: config.modules[i].tests
      });
    }
  }

  // The test run is officially beginning now
  emit('runStart', runSuite.start(true));
  runLoggingCallbacks('begin', {
    totalTests: Test.count,
    modules: modulesLog
  }).then(unblockAndAdvanceQueue);
}

exportQUnit(QUnit);

export default QUnit;
