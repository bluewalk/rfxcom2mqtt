'use strict';

const mqtt = require('mqtt');
const rfxcom = require('rfxcom');
const config = require('node-config-yaml').load('config.yml');

const DEBUG = process.env.DEBUG || false;
const MQTT_SERVER = process.env.MQTT_HOST || 'mqtt://127.0.0.1';
const MQTT_USERNAME = process.env.MQTT_USERNAME || null;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || null;
const MQTT_BASE_TOPIC = process.env.MQTT_BASE_TOPIC || 'rfxcom2mqtt';


const topic = MQTT_BASE_TOPIC + '/devices';
const topic_will = MQTT_BASE_TOPIC + '/status';
const topic_info = MQTT_BASE_TOPIC + '/info';
const topic_command = MQTT_BASE_TOPIC + '/command';
const topic_connected = MQTT_BASE_TOPIC + '/connected';

console.log('RFXCOM2MQTT Starting...');
console.log(config);

const mqttClient = mqtt.connect(MQTT_SERVER, {
  clientId: 'RfxCOM2MQTT-' + Math.random().toString(16).substring(2, 8),
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  will: {
    topic: topic_will,
    payload: 'offline',
    retain: true
  }
});

mqttClient.on('connect', () => {
  console.log('Connected to MQTT')
  mqttClient.subscribe([topic_command], () => {
    console.log(`Subscribing to topic '${topic_command}'`)
  })
})

// MQTT Connect
mqttClient.on('connect', () => {
  mqttClient.publish(topic_will, 'online', { qos: 0, retain: true }, (error) => {
    if (error) {
      console.error(error)
    }
  })
})

const sendToMQTT = function (type, evt) {
  var json = JSON.stringify(evt, null, 2)
  json = json.slice(0, 1) + "\n  \"type\":\"" + type + "\"," + json.slice(1)

  var device = evt.id;
  if (type === 'lighting4') {
    device = evt.data
  }

  mqttClient.publish(topic + '/' + device, json, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.error(error)
    }
  });

  if (DEBUG) console.log('RFXCOM Receive:', json);
}

// RFXCOM Init
var rfxdebug = (config.rfxcom.debug) ? config.rfxcom.debug : false;
var rfxtrx = new rfxcom.RfxCom(config.rfxcom.usbport, { debug: rfxdebug });
// TODO: transmit protocols
// rfxcom.lighting2[evt.subtype]
var lighting2 = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2['AC']);
var lighting4 = new rfxcom.Lighting4(rfxtrx, rfxcom.lighting4.PT2262);
var chime1 = new rfxcom.Chime1(rfxtrx, rfxcom.chime1.SELECT_PLUS);

rfxtrx.initialise(function (error) {
  if (error) {
    throw new Error('Unable to initialise the RFXCOM device');
  } else {
    console.log('RFXCOM device initialised');
  }
});

// RFXCOM Transmit
mqttClient.on('message', (topic_command, payload) => {
  if (DEBUG) console.log('RFXCOM Transmit:', payload.toString())

  const message = JSON.parse(payload);

  const repeat = (config.rfxcom.transmit.repeat) ? config.rfxcom.transmit.repeat : 1
  for (var i = 0; i < repeat; i++) {
    if (message.type === 'lighting2') {
      const cmd = message.command.split(' ')
      if (cmd[0] === 'on') {
        lighting2.switchOn(message.id);
      } else if (cmd[0] === 'off') {
        lighting2.switchOff(message.id);
      } else if (cmd[0] === 'level') {
        lighting2.setLevel(message.id, cmd[1]);
      }
    }
    if (message.type === 'lighting4') {
      lighting4.sendData(message.id);
    }
    if (message.type === 'chime1') {
      chime1.chime(message.id);
    }
  }
})

Object.keys(rfxcom.packetNames).map(function (key) {
  return rfxcom.packetNames[key];
}).slice(4).forEach(function (protocol) {
  rfxtrx.on(protocol, function (evt) { sendToMQTT(protocol, evt) });
});

// RFXCOM Status
rfxtrx.on('status', function (evt) {
  var json = JSON.stringify(evt, function (key, value) {
    if (key === 'subtype' || key === 'seqnbr' || key === 'cmnd') {
      return undefined;
    }
    return value;
  }, 2);

  mqttClient.publish(topic_info, json, { qos: 0, retain: false }, (error) => {
    if (error) {
      console.error(error);
    }
  })
  console.log('RFXCOM Status:', json);
});
