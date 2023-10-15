#!/usr/bin/env node

// const Mqtt = require('mqtt')
const pkg = require('./package.json')
const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const mqtt_helpers = require('homeautomation-js-lib/mqtt_helpers.js')
const SonyDriver = require('./lib/sony.js')

const AVR_IP = process.env.AVR_IP
var AVR_PORT = process.env.AVR_PORT

var topic_prefix = process.env.TOPIC_PREFIX
var mqttConnected = false
const mqttOptions = { retain: true, qos: 1 }

if (_.isNil(topic_prefix)) {
    logging.error('TOPIC_PREFIX not set, not starting')
    process.abort()
}

if (_.isNil(AVR_IP)) {
    logging.error('AVR_IP not set, not starting')
    process.abort()
}

if (_.isNil(AVR_PORT)) {
    AVR_PORT = 10000
}

logging.info(pkg.name + ' ' + pkg.version + ' starting')

const sony = new SonyDriver(AVR_IP, AVR_PORT)

sony.on('inputChanged', (zone, inputName) => {
    logging.info('input changed: ' + inputName + ' zone: ' + zone)
    publish('zone_' + zone + '/input', inputName)
})
sony.on('zoneStatusChanged', (zone, status) => {
    logging.info('zone status changed: ' + zone + ' status: ' + status)
    publish('zone_' + zone, status)
})

const mqtt = mqtt_helpers.setupClient(function () {
    mqttConnected = true

    const topicsToSubscribeTo = [topic_prefix + '/+/+/set', topic_prefix + '/standby/set']
    topicsToSubscribeTo.forEach(topic => {
        logging.info('mqtt subscribe: ' + topic)
        mqtt.subscribe(topic, { qos: 1 })
    })
}, function () {
    if (mqttConnected) {
        mqttConnected = false
        logging.error('mqtt disconnected')
    }
})

mqtt.on('error', err => {
    logging.error('mqtt: ' + err)
})


mqtt.on('message', (inTopic, inPayload) => {
    logging.info('mqtt <' + inTopic + ':' + inPayload)
    processIncomingMQTT(inTopic, inPayload)
})


const publish = function (name, value) {
    if (!_.isNil(mqtt)) {
        if (_.isNil(value)) {
            value = '0'
        }

        if (value == 'OFF') {
            value = '0'
        } else if (value == 'STANDBY') {
            value = '0'
        } else if (value == 'ON') {
            value = '1'
        } else if (value == false) {
            value = '0'
        } else if (value == true) {
            value = '1'
        }

        value = value.toString().toLowerCase()

        mqtt.smartPublish(topic_prefix + '/' + name, value.toString(), mqttOptions)
    }
}

const processIncomingMQTT = function (inTopic, inPayload) {
    var topic = inTopic
    var payload = String(inPayload)

    const components = topic.split('/')

    if (_.includes(topic, '/standby/set')) {
        logging.info('setting standby to ' + payload)

        sony.setPowerStatus(payload)
    } else if (_.includes(topic, '/power/set')) {
        const zone = _.split(components[components.length - 3], 'zone_')[1]

        logging.info('setting zone ' + zone + ' power to ' + payload)

        sony.setZonePowerStatus(zone, payload)
    } else if (_.includes(topic, '/input/set')) {
        const zone = _.split(components[components.length - 3], 'zone_')[1]

        logging.info('setting zone ' + zone + ' input to ' + payload)

        sony.setInputForZone(zone, payload)
    }
}