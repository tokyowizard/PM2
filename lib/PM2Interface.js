var Util   = require('util')
var Path   = require('path')
var EE     = require('events').EventEmitter
var Async  = require('async')
var Satan  = require('./Satan')
var Common = require('./Common')

module.exports = PM2I

function PM2I() {
  var self = new EE()
  self.__proto__ = PM2I.prototype
  return self
}

Util.inherits(PM2I, EE)

PM2I.prototype.connect = function(cb) {
  Satan.start(cb)
}

PM2I.prototype.disconnect = function(cb) {
  Satan.disconnectRPC(cb)
}

PM2I.prototype.list = function(spec, cb) {
  var self = this
  if (typeof(spec) === 'function') cb = spec, spec = {}

  executeRemote.call(self, 'getMonitorData', {}, function(err, arr) {
    if (err) return cb(err)
    arr = arr.filter(function(proc) {
      if (spec.id != null && proc.pm_id !== Number(spec.id)) return false
      if (spec.name != null && proc.name !== String(spec.name)) return false
      if (spec.script != null &&
        Path.basename(proc.pm2_env.pm_exec_path) !== String(spec.script))
          return false
      if (spec.port != null &&
        Path.basename(proc.pm2_env.port) !== Number(spec.port)) return false
      if (spec.path != null &&
        proc.pm2_env.pm_exec_path !== String(spec.path)) return false
      return true
    })
    cb(null, arr)
  })
}

PM2I.prototype.start = function(spec, cb) {
  var self = this
  if (typeof(spec) === 'function') cb = spec, spec = {}

  forEachProcess.call(self, spec, function(proc, next) {
    executeRemote.call(self, 'startProcessId', proc.pm_id, function(err, res) {
      return next(err)
    })
  }, cb)
}

PM2I.prototype.stop = function(spec, cb) {
  var self = this
  if (typeof(spec) === 'function') cb = spec, spec = {}

  forEachProcess.call(self, spec, function(proc, next) {
    executeRemote.call(self, 'stopProcessId', proc.pm_id, function(err, res) {
      return next(err)
    })
  }, cb)
}

PM2I.prototype.restart = function(spec, cb) {
  var self = this
  if (typeof(spec) === 'function') cb = spec, spec = {}

  forEachProcess.call(self, spec, function(proc, next) {
    executeRemote.call(self, 'restartProcessId', {
      id: proc.pm_id,
      env: process.env, // TODO: preserve env?
    }, function(err, res) {
      return next(err)
    })
  }, cb)
}

PM2I.prototype.delete = function(spec, cb) {
  var self = this
  if (typeof(spec) === 'function') cb = spec, spec = {}

  forEachProcess.call(self, spec, function(proc, next) {
    executeRemote.call(self, 'deleteProcessId', proc.pm_id, function(err, res) {
      return next(err)
    })
  }, cb)
}

PM2I.prototype.version = function(cb) {
  var self = this
  executeRemote.call(self, 'getVersion', {}, cb)
}

PM2I.prototype.create = function(options, cb) {
  try {
    options = this.utils.normalizeConfig(options)
  } catch(err) {
    return cb(err)
  }

  executeRemote.call(self, 'prepare', app, cb)
}

PM2I.prototype.utils = {}

PM2I.prototype.utils.normalizeConfig = function(options) {
  var opts = {}

  var alias = {
    script_args : 'args',
    error       : 'error_file',
    output      : 'out_file',
    pid         : 'pid_file',
    cron        : 'cron_restart',
    interpreter : 'exec_interpreter',
  }

  if (typeof(options) === 'string') {
    opts.script = options
  } else {
    for (var i in options) {
      var snake = i.replace(/[^A-Z][A-Z]/g, function(str){
        return str[0] + '_' + str[1].toLowerCase()
      })
      opts[snake in alias ? alias[snake] : snake] = options[i]
    }
  }

  if (!opts.script) return cb(Error('"script" option is mandatory'))

  if (!opts.name) opts.name = Path.basename(opts.script, '.js')

  //maintain backwards compat for space delimited string args
  if (typeof(opts.node_args) === 'string') {
    opts.node_args = opts.node_args.split(' ')
  } else if (!Array.isArray(opts.node_args)) {
    opts.node_args = []
  }

  if (typeof(opts.args) !== 'string') opts.args = JSON.stringify(opts.args)

  if (!opts.exec_mode) {
    if (opts.execute_command)
      opts.exec_mode = 'fork_mode'
    else if (opts.instances)
      opts.exec_mode = 'cluster_mode'
    else
      opts.exec_mode = 'fork_mode'
  }

  if (opts.execute_command && !opts.interpreter) {
    if (extItps[Path.extname(script)])
      opts.exec_interpreter = extItps[Path.extname(script)]
    else
      opts.exec_interpreter = 'none'
  }

  if (opts.raw_args) {
    var env = opts.raw_args.indexOf('--') + 1
    if (env > 1)
      opts.args = JSON.stringify(opts.raw_args.slice(env, opts.raw_args.length))
  }

  var app = Common.resolveAppPaths(opts, Path.resolve(opts.cwd || '.'))
  if (app instanceof Error) throw Error(app.message)
  return app
}

function forEachProcess(spec, fn, cb) {
  var succeeded = []
  this.list(spec, function(err, list) {
    if (err) return cb(err)
    Async.eachLimit(list, 1, function(proc, cb) {
      fn(proc, function(err) {
        if (!err) succeeded.push(proc)
        cb()
      })
    }, function(err) {
      if (err) return cb(err)
      cb(null, succeeded)
    })
  })
}

function executeRemote(command, args, cb) {
  this.emit('command', command, args)
  Satan.executeRemote(command, args, function(err) {
    var m
    if (!err && (m = command.match(/^([a-z]+)ProcessId$/)))
      Satan.notifyGod(m[1], args.id != null ? args.id : args)
    cb.apply(null, arguments)
  })
}
