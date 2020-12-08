'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const events_1 = require("events");
const net = require("net");
const errors_1 = require("../common/errors");
const log_1 = require("../common/log");
const utils_1 = require("../common/utils");
const CommandType = require("./commands");
const ipcOutgoingFd = 3;
const ipcIncomingFd = 4;
function encodeCommand(commandType, content) {
    const contentBuffer = Buffer.from(content);
    const contentLengthBuffer = Buffer.from(contentBuffer.length.toString().padStart(14, '0'));
    return Buffer.concat([Buffer.from(commandType), contentLengthBuffer, contentBuffer]);
}
exports.encodeCommand = encodeCommand;
function decodeCommand(data) {
    if (data.length < 8) {
        return [false, '', '', data];
    }
    const commandType = data.slice(0, 2).toString();
    const contentLength = parseInt(data.slice(2, 16).toString(), 10);
    if (data.length < contentLength + 16) {
        return [false, '', '', data];
    }
    const content = data.slice(16, contentLength + 16).toString();
    const remain = data.slice(contentLength + 16);
    return [true, commandType, content, remain];
}
exports.decodeCommand = decodeCommand;
class IpcInterface {
    constructor(outStream, inStream, acceptCommandTypes) {
        this.logger = log_1.getLogger();
        this.acceptCommandTypes = acceptCommandTypes;
        this.outgoingStream = outStream;
        this.incomingStream = inStream;
        this.eventEmitter = new events_1.EventEmitter();
        this.readBuffer = Buffer.alloc(0);
        this.incomingStream.on('data', (data) => { this.receive(data); });
        this.incomingStream.on('error', (error) => { this.eventEmitter.emit('error', error); });
        this.outgoingStream.on('error', (error) => { this.eventEmitter.emit('error', error); });
    }
    sendCommand(commandType, content = '') {
        this.logger.debug(`ipcInterface command type: [${commandType}], content:[${content}]`);
        assert.ok(this.acceptCommandTypes.has(commandType));
        try {
            const data = encodeCommand(commandType, content);
            if (!this.outgoingStream.write(data)) {
                this.logger.warning('Commands jammed in buffer!');
            }
        }
        catch (err) {
            throw errors_1.NNIError.FromError(err, `Dispatcher Error, please check this dispatcher log file for more detailed information: ${utils_1.getLogDir()}/dispatcher.log . `);
        }
    }
    onCommand(listener) {
        this.eventEmitter.on('command', listener);
    }
    onError(listener) {
        this.eventEmitter.on('error', listener);
    }
    receive(data) {
        this.readBuffer = Buffer.concat([this.readBuffer, data]);
        while (this.readBuffer.length > 0) {
            const [success, commandType, content, remain] = decodeCommand(this.readBuffer);
            if (!success) {
                break;
            }
            assert.ok(this.acceptCommandTypes.has(commandType));
            this.eventEmitter.emit('command', commandType, content);
            this.readBuffer = remain;
        }
    }
}
exports.IpcInterface = IpcInterface;
function createDispatcherInterface(process) {
    const outStream = process.stdio[ipcOutgoingFd];
    const inStream = process.stdio[ipcIncomingFd];
    return new IpcInterface(outStream, inStream, new Set([...CommandType.TUNER_COMMANDS, ...CommandType.ASSESSOR_COMMANDS]));
}
exports.createDispatcherInterface = createDispatcherInterface;
function createDispatcherPipeInterface(pipePath) {
    const client = net.createConnection(pipePath);
    return new IpcInterface(client, client, new Set([...CommandType.TUNER_COMMANDS, ...CommandType.ASSESSOR_COMMANDS]));
}
exports.createDispatcherPipeInterface = createDispatcherPipeInterface;
