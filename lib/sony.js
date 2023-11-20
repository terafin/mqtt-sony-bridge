'use strict';

const _ = require('lodash')
const logging = require('homeautomation-js-lib/logging.js')
const got = require('got')
const WebSocket = require('ws')
const EventEmitter = require('events')
const interval = require('interval-promise')

const AV_SERVICE = 'avContent'
const SYSTEM_SERVICE = 'system'
const GUIDE_SERVICE = 'guide'

const PING_INTERVAL = 1 * 1000
const PINGS_TO_DIE = 5
const DISCONNECT_DETECT_INTERVAL = ((PINGS_TO_DIE + 1) * PING_INTERVAL)
const RECONNECT_INTERVAL = DISCONNECT_DETECT_INTERVAL * 2

class SonyDriver extends EventEmitter {
    address = null
    port = null

    wsAV = null
    wsSystem = null

    lastSystemPong = null
    lastAVPong = null

    constructor(address, port) {
        super()

        this.address = address
        this.port = port

        if (_.isNil(address)) {
            logging.error('address not set, aborting')
            process.abort()
        }

        if (_.isNil(port)) {
            logging.error('port not set, aborting')
            process.abort()
        }

        interval(async () => {
            if (!_.isNil(this.wsAV) && this.wsAV.readyState == WebSocket.OPEN) {
                this.wsAV.ping('ping')
                logging.debug('pinging wsAV')
            }
            if (!_.isNil(this.wsSystem) && this.wsSystem.readyState == WebSocket.OPEN) {
                this.wsSystem.ping('ping')
                logging.debug('pinging wsSystem')
            }
        }, PING_INTERVAL)

        interval(async () => {
            if (!_.isNil(this.lastAVPong) && !_.isNil(this.wsAV) && this.wsAV.readyState == WebSocket.OPEN) {
                if (_.isNil(this.lastAVPong) || (Date.now() - this.lastAVPong) > (PING_INTERVAL * PINGS_TO_DIE)) {
                    logging.error('av pong not received in ' + ((PING_INTERVAL * PINGS_TO_DIE) / 1000) + ' seconds, closing socket')
                    try {
                        if (this.wsAV.readyState == WebSocket.OPEN) {
                            this.wsAV.terminate()
                        }
                        this.wsAV = null
                    } catch (error) {

                    }
                }
            }

            if (!_.isNil(this.lastSystemPong) && !_.isNil(this.wsSystem) && this.wsSystem.readyState == WebSocket.OPEN) {
                if (_.isNil(this.lastSystemPong) || (Date.now() - this.lastSystemPong) > (PING_INTERVAL * PINGS_TO_DIE)) {
                    logging.error('system pong not received in ' + ((PING_INTERVAL * PINGS_TO_DIE) / 1000) + ' seconds, closing socket')
                    try {
                        if (this.wsSystem.readyState == WebSocket.OPEN) {
                            this.wsSystem.terminate()
                        }
                        this.wsSystem = null
                    } catch (error) {

                    }
                }
            }

        }, DISCONNECT_DETECT_INTERVAL)

        interval(async () => {
            if (this.connected == true) {
                return
            }

            logging.info('Disconnected, so reconnecting...')
            this.connect()
        }, RECONNECT_INTERVAL)

        this.connect()
    }

    // Status Management

    get connected() {
        return !_.isNil(this.wsAV) && this.wsAV.readyState == WebSocket.OPEN && !_.isNil(this.wsSystem) && this.wsSystem.readyState == WebSocket.OPEN
    }

    // Setup

    setupSystemWebSocket() {
        var that = this

        this.wsSystem = new WebSocket('ws://' + this.address + ':' + this.port + '/sony/' + SYSTEM_SERVICE)

        this.wsSystem.on('pong', (data) => {
            logging.debug('system pong received: ' + data)
        })

        this.wsSystem.on('open', function open() {
            logging.info('system socket opened')
        })

        this.wsSystem.on('close', function closed() {
            logging.error('system socket closed')
        })

        this.wsSystem.on('message', function message(data) {
            const json = JSON.parse(data)

            logging.info('system json: ' + JSON.stringify(json))
        })
    }

    setupAVSystemWebSocket() {
        var that = this
        this.wsAV = new WebSocket('ws://' + that.address + ':' + that.port + '/sony/' + AV_SERVICE)

        this.wsAV.on('open', function open() {
            logging.info('av socket opened')
            that._sendCommand(AV_SERVICE, that._switchNotifications(1, ['notifyPlayingContentInfo', 'notifyPowerStatus', 'notifyVolumeInformation', 'notifyMessageToDisplay', 'notifySWUpdateInfo'], null))
        })

        this.wsAV.on('close', function close() {
            logging.error('AV socket closed')
            that.emit('disconnected')
        })

        this.wsAV.on('pong', (data) => {
            logging.debug('av pong received: ' + data)
            that.lastAVPong = Date.now()
        })

        this.wsAV.on('message', function message(data) {
            const json = JSON.parse(data)

            logging.info('av json: ' + JSON.stringify(json))
            if (!_.isNil(json.id)) {
                logging.info('response for id: ' + json.id)
                return
            }

            switch (json.method) {
                case 'notifyAvailablePlaybackFunction':
                    that._notifyAvailablePlaybackFunction(json.params[0])
                    break
                case 'notifyExternalTerminalStatus':
                    that._notifyExternalTerminalStatus(json.params[0])
                    break
                case 'notifyPlayingContentInfo':
                    that._notifyPlayingContentInfo(json.params[0])
                    break
                default:
                    logging.error('unhandled method: ' + json.method)
                    logging.error('        response: ' + JSON.stringify(json.params))
                    break
            }
        })

    }

    // Connection Management

    connect() {
        if (this.connected == true) {
            this.disconnect()
        }

        this.setupAVSystemWebSocket()
        this.setupSystemWebSocket()
    }

    disconnect() {
        var didAnything = false

        if (!_.isNil(this.wsAV)) {
            try {
                if (this.wsAV.readyState == WebSocket.OPEN) {
                    this.wsAV.terminate()
                    this.wsAV = null
                }
            } catch (error) {
                logging.error('error terminating av socket: ' + error)
            }
            didAnything = true
        }

        if (!_.isNil(this.wsSystem)) {
            try {
                if (this.wsSystem.readyState == WebSocket.OPEN) {
                    this.wsSystem.terminate()
                    this.wsSystem = null
                }
            } catch (error) {
                logging.error('error terminating av socket: ' + error)
            }
            didAnything = true
        }
    }



    // Private generators
    _notifyAvailablePlaybackFunction(params) {
        if (_.isNil(params)) {
            return
        }
        // Not interested in this, notifyPlayingContentInfo does it
    }

    _notifyPlayingContentInfo(params) {
        if (_.isNil(params)) {
            return
        }
        const kind = params.kind


        switch (kind) {
            case 'input':
                {
                    const output = params.output
                    const zone = _.split(output, 'extOutput:zone?zone=')[1]
                    const inputName = _.split(params.uri, 'extInput:')[1]
                    logging.info('input changed: ' + params.uri)
                    logging.info('       output: ' + params.output)
                    logging.info('        input: ' + inputName)
                    logging.info('         zone: ' + zone)
                    this.emit('inputChanged', zone, inputName)
                }
                break
        }
    }


    _notifyExternalTerminalStatus(params) {
        if (_.isNil(params)) {
            return
        }
        const uri = params.uri
        const active = params.active == 'active' ? true : false
        const zone = _.split(uri, 'extOutput:zone?zone=')[1]

        logging.info('power status changed: ' + params.active)
        logging.info('                 uri: ' + params.uri)
        logging.info('              active: ' + active)
        logging.info('                zone: ' + zone)
        this.emit('zoneStatusChanged', zone, active)
    }

    _switchNotifications(id, enabled, disabled) {
        var enabledArray = []

        if (!_.isNil(enabled)) {
            enabled.forEach(enable => {
                enabledArray.push({ name: enable, version: '1.1' })
            })
        }

        var disabledArray = []

        if (!_.isNil(disabled)) {
            disabled.forEach(disable => {
                disabledArray.push({ name: disable, version: '1.1' })
            })
        }

        return {
            'method': 'switchNotifications',
            'id': id,
            'params': [{
                'disabled': enabledArray,
                'enabled': disabledArray
            }],
            'version': '1.2'
        }
    }

    _getSupportedApiInfo() {
        return {
            "method": "getSupportedApiInfo",
            "id": 5,
            "params": [
                {
                    "services": [
                        "system",
                        "avContent"
                    ]
                }
            ],
            "version": "1.0"
        }
    }

    _setActiveTerminal(zone, active) {
        return {
            'id': 2,
            'method': 'setActiveTerminal',
            'params': [{
                'active': active ? 'active' : 'inactive',
                'uri': 'extOutput:zone?zone=' + zone
            }],
            'version': '1.0'
        }
    }

    _setPlayContent(zone, input) {
        return {
            'id': 2,
            'method': 'setPlayContent',
            'params': [{
                'output': 'extOutput:zone?zone=' + zone,
                'uri': 'extInput:' + input
            }],
            'version': '1.2'
        }
    }

    _setPowerStatus(power) {
        return {
            "method": "setPowerStatus",
            "id": 2,
            "params": [
                {
                    "status": power == true ? "active" : "standby"
                }
            ],
            "version": "1.1"
        }
    }

    _sendCommand(service, command) {
        const json = JSON.stringify(command)
        logging.info('system: ' + service + '   sending: ' + json)

        switch (service) {
            case AV_SERVICE:
                if (this.wsAV.readyState == WebSocket.OPEN) {
                    this.wsAV.send(json)
                } else {
                    logging.error('av socket not open, cannot send command')
                }
                break
            case SYSTEM_SERVICE:
                if (this.wsSystem.readyState == WebSocket.OPEN) {
                    this.wsSystem.send(json)
                } else {
                    logging.error('system socket not open, cannot send command')
                }
                break
            default:
                break
        }
    }

    _apiURL(service) {
        return 'http://' + this.address + ':' + this.port + '/sony/' + service
    }

    _sendHTTPCommand(service, json) {
        const url = this._apiURL(service)
        _doPost(url, json)
    }


    // input translations

    _translateInput(input) {
        var translatedInput = input.toString()

        switch (translatedInput) {
            case 'media':
            case 'mediabox':
                translatedInput = 'mediaBox'

            default:
        }

        return translatedInput
    }



    // public functions
    setPowerStatus(power) {
        this._sendHTTPCommand(SYSTEM_SERVICE, this._setPowerStatus(power == '1' ? true : false))
    }

    setZonePowerStatus(zone, power) {
        this._sendHTTPCommand(AV_SERVICE, this._setActiveTerminal(zone, power == '1' ? true : false))
    }

    setInputForZone(zone, input) {
        this._sendHTTPCommand(AV_SERVICE, this._setPlayContent(zone, this._translateInput(input)))
    }
}


async function _doPost(url, body) {
    logging.info('   * doPost: ' + url + ' form data: ' + JSON.stringify(body))

    var responseBody = null

    try {

        const options = {
            json: body
        }
        logging.info('options: ' + JSON.stringify(options))
        const response = await got.post(url, options)

        // check for empty strings
        if (response.body.length > 0)
            responseBody = JSON.parse(response.body)
        else
            responseBody = response.body

        if (!_.isNil(responseBody) && !_.isNil(responseBody.error)) {
            logging.error('post failed: ' + responseBody.error)
            throw ('doPost error ' + responseBody.error)
        }

        logging.info(' url: ' + url)
        logging.info(' response: ' + JSON.stringify(responseBody))
    } catch (error) {
        logging.error('post failed: ' + error)
    }

    return responseBody
}


module.exports = SonyDriver