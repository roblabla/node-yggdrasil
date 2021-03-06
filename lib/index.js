/* jshint node: true */
"use strict";
var crypto = require('crypto');
var assert = require('assert');
var request = require('request');
var uuid = require('uuid');
var version = require('../package.json').version;

var k = function Yggdrasil (con) {
  var config = {
    host : con.host || "https://authserver.mojang.com" //Allow for a custom auth server
  };
  
  var request = require('request').defaults({
    headers: {
      "User-Agent" : "node-yggdrasil/" + version,
      "Content-Type" : "application/json"
    }
  });

  var r = {};
  r._call = function (path, data, cb) {
    request({
      method: 'POST',
      uri: config.host + "/" + path,
      json: data
    }, function (err, resp, body) {
      if (body && body.error) {
        var out = body.errorMessage;
        out.status = resp.statusCode;
        cb(out);
      } else {
        cb(err, body);
      }
    });
  };

  /**
   * Attempts to authenticate a user.
   * @param  {Object}   options Config object
   * @param  {Function} cb      Callback
   */
  r.auth = function (options, cb) {
    if (options.token === null) {
      delete options.token;
    } else {
      options.token = options.token || uuid.v4();
    }
    
    options.agent = options.agent || "Minecraft";
    r._call('authenticate', {
      agent : {
        name: options.agent,
        version : options.agent === "Minecraft" ? 1 : options.version
      },
      username: options.user,
      password: options.pass,
      clientToken: options.token
    }, function (err, data) {
      cb(err, data);
    });
  };

  /**
   * Refreshes a accessToken.
   * @param  {String}   access Old Access Token
   * @param  {String}   client Client Token
   * @param  {Function} cb     (err, new token)
   */
  r.refresh = function (access, client, cb) {
    r._call('refresh', {
      accessToken: access,
      clientToken: client
    }, function (err, data) {
      if (data.clientToken !== client) {
        cb("clientToken assertion failed");
      } else {
        cb(null, data.accessToken);
      }
    });
  };

  /**
   * Validates an access token
   * @param  {String}   token Token to validate
   * @param  {Function} cb    (is okay, error)
   */
  r.validate = function (token, cb) {
    r._call('validate', {
      accessToken: token
    }, function (err, data) {
      if (err) {
        cb(false, err);
      } else {
        cb(true);
      }
    });
  };
  /**
   * Invalidates all access tokens.
   * @param  {String}   user User's user
   * @param  {String}   pass User's pass
   * @param  {Function} cb   (worked, error)
   */
  r.signout = function (user, pass, cb) {
    r._call('signout', {
      username: user,
      password: pass
    }, function (err, data) {
      if (err) {
        cb(false, err);
      } else {
        cb(true);
      }
    });
  };

  return r;
};


k.server = function Server(con) {
  var config = {
    host : con.host || "https://sessionserver.mojang.com" //Allow for a custom auth server
  };
  
  var request = require('request').defaults({
    headers: {
      "User-Agent" : "node-yggdrasil/" + version,
      "Content-Type" : "application/json"
    }
  });

  var r = {};
  r._call = function (path, data, cb) {
    request({
      method: 'POST',
      uri: config.host + "/" + path,
      json: data
    }, function (err, resp, body) {
      if (body && body.error) {
        var out = body.errorMessage;
        out.status = resp.statusCode;
        cb(out);
      } else {
        cb(err, body);
      }
    });
  };


  /**
   * Java's annoying hashing method. 
   * All credit to andrewrk
   * https://gist.github.com/andrewrk/4425843
   */
  function performTwosCompliment(buffer) {
    var carry = true;
    var i, newByte, value;
    for (i = buffer.length - 1; i >= 0; --i) {
      value = buffer.readUInt8(i);
      newByte = ~value & 0xff;
      if (carry) {
        carry = newByte === 0xff;
        buffer.writeUInt8(newByte + 1, i);
      } else {
        buffer.writeUInt8(newByte, i);
      }
    }
  }

  r.mcHexDigest = function mcHexDigest(str) {
    var hash = new Buffer(crypto.createHash('sha1').update(str).digest(), 'binary');
    // check for negative hashes
    var negative = hash.readInt8(0) < 0;
    if (negative) performTwosCompliment(hash);
    var digest = hash.toString('hex');
    // trim leading zeroes
    digest = digest.replace(/^0+/g, '');
    if (negative) digest = '-' + digest;
    return digest;
  };


  r.join = function (token, profile, serverid, sharedsecret, serverkey, cb) {
    r._call('session/minecraft/join', {
      "accessToken": token,
      "selectedProfile": profile,
      "serverId": r.mcHexDigest(serverid + sharedsecret + serverkey)
    }, function(err, data) {
      cb(err, data);
    });
  };

  r.hasJoined = function (username, serverid, sharedsecret, serverkey, cb) {
    var hash = r.mcHexDigest(serverid + sharedsecret + serverkey);
    request({
      method: 'GET',
      uri: config.host + '/session/minecraft/hasJoined?username='+username+'&serverId='+hash
    }, function (err, resp, body) {
      if (body && body.error) {
        var out = body.errorMessage;
        out.status = resp.statusCode;
        cb(out);
      } else {
        cb(err, body);
      }
    });
  };


  return r;
};

module.exports = k;