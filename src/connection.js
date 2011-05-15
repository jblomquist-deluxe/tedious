var
events = require("events"),
  net = require('net'),
  sys = require('sys'),
  util = require('util'),
  isPacketComplete = require('./packet').isPacketComplete,
  bufferToArray = require('./buffer-util').toArray,
  Packet = require('./packet').Packet,
  PACKET_TYPE = require('./packet').TYPE,
  ENCRYPT = require('./prelogin-packet').ENCRYPT,
  PreLoginPacket = require('./prelogin-packet').PreLoginPacket,
  LoginPacket = require('./login-packet').LoginPacket,
  DEFAULT_PORT = 1433,
  
  STATE = {
    SENT_PRELOGIN: 0,
    SENT_LOGIN: 1,
    LOGGED_IN: 2
  };

var Connection = function(host, port, loginData) {
  var self = this,
      connection,
      packetBuffer = [];

  events.EventEmitter.call(self);
  
  port = port | DEFAULT_PORT;
  self.loginData = loginData;
  self.packetBuffer = [];

  self.connection = net.createConnection(port, host);
  
  this.connection.addListener('connect', function() {
    sendPreLoginPacket();
  });
  
  this.connection.addListener('data', function(data) {
    var packet,
        decodedPacket;
    
    self.packetBuffer = self.packetBuffer.concat(bufferToArray(data));

    if (isPacketComplete(self.packetBuffer)) {
      packet = new Packet(self.packetBuffer);
      decodedPacket = packet.decode();

      // Remove the current packet from the buffer.
      self.packetBuffer = self.packetBuffer.slice(packet.length);
      
      logPacket('Received', packet);
      self.emit('packet', decodedPacket);            // REMOVE THIS - remove tests' dependency on this
      
      switch (self.state) {
      case STATE.SENT_PRELOGIN:
        processPreLoginResponse(packet, decodedPacket);
        break
      case STATE.SENT_LOGIN:
        processLoginResponse(packet, decodedPacket);
        break
      default:
        console.log('Unexepected state ' + self.state);
      }
    }
  });
  
  this.connection.addListener('end', function(){
    console.log('end');
  });
  
  this.connection.addListener('timeout', function(){
    console.log('timeout');
  });
  
  this.connection.addListener('error', function(exception){
    console.log('error: ' + exception);
  });
  
  this.connection.addListener('close', function(had_error){
    console.log('close: ' + had_error);
  });

  function sendPreLoginPacket() {
    var packet = new PreLoginPacket({last: true});
    
    sendPacket(packet);
    self.state = STATE.SENT_PRELOGIN
  }

  function processPreLoginResponse(rawPacket, packet) {
    var preLoginPacket = new PreLoginPacket(rawPacket);
    var dataAsString;
    
    dataAsString = preLoginPacket.dataAsString('  ');
    if (dataAsString) {
      console.log(dataAsString);
    }
    
    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to PRELOGIN, but received ' + packet.header.type);
    }

    if (packet.header.encryption !== ENCRYPT.NOT_SUP) {
      self.emit('fail', 'Encryption not supported (yet), but response to PRELOGIN specified encryption ' + packet.header.encryption);
    }
    
    sendLoginPacket();
  }

  function processLoginResponse(rawPacket, packet) {
    if (packet.header.type !== PACKET_TYPE.TABULAR_RESULT) {
      self.emit('fail', 'Expected TABULAR_RESULT packet in response to LOGIN, but received ' + packet.header.type);
    }
  }

  function sendLoginPacket() {
    var packet = new LoginPacket({last: true}, self.loginData);

    sendPacket(packet);
    self.state = STATE.SENT_LOGIN
  }

  function sendPacket(packet) {
    logPacket('Sent', packet);
    self.connection.write(packet.buffer);
  }

  function logPacket(text, packet) {
    console.log(text + ' packet');
    
    console.log(packet.headerToString('  '));
    console.log(packet.dataDump('  '));
  }
}

util.inherits(Connection, events.EventEmitter);

module.exports = Connection;