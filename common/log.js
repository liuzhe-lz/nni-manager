'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const stream_buffers_1 = require("stream-buffers");
const util_1 = require("util");
const component = require("../common/component");
const experimentStartupInfo_1 = require("./experimentStartupInfo");
const FATAL = 1;
const ERROR = 2;
const WARNING = 3;
const INFO = 4;
const DEBUG = 5;
const TRACE = 6;
const logLevelNameMap = new Map([['fatal', FATAL],
    ['error', ERROR], ['warning', WARNING], ['info', INFO], ['debug', DEBUG], ['trace', TRACE]]);
exports.logLevelNameMap = logLevelNameMap;
class BufferSerialEmitter {
    constructor(writable) {
        this.buffer = Buffer.alloc(0);
        this.emitting = false;
        this.writable = writable;
    }
    feed(buffer) {
        this.buffer = Buffer.concat([this.buffer, buffer]);
        if (!this.emitting) {
            this.emit();
        }
    }
    emit() {
        this.emitting = true;
        this.writable.write(this.buffer, () => {
            if (this.buffer.length === 0) {
                this.emitting = false;
            }
            else {
                this.emit();
            }
        });
        this.buffer = Buffer.alloc(0);
    }
}
let Logger = class Logger {
    constructor(fileName) {
        this.level = INFO;
        this.readonly = false;
        const logFile = fileName;
        if (logFile) {
            this.writable = fs.createWriteStream(logFile, {
                flags: 'a+',
                encoding: 'utf8',
                autoClose: true
            });
            this.bufferSerialEmitter = new BufferSerialEmitter(this.writable);
        }
        const logLevelName = experimentStartupInfo_1.getExperimentStartupInfo()
            .getLogLevel();
        const logLevel = logLevelNameMap.get(logLevelName);
        if (logLevel !== undefined) {
            this.level = logLevel;
        }
        this.readonly = experimentStartupInfo_1.isReadonly();
    }
    close() {
        if (this.writable) {
            this.writable.destroy();
        }
    }
    trace(...param) {
        if (this.level >= TRACE) {
            this.log('TRACE', param);
        }
    }
    debug(...param) {
        if (this.level >= DEBUG) {
            this.log('DEBUG', param);
        }
    }
    info(...param) {
        if (this.level >= INFO) {
            this.log('INFO', param);
        }
    }
    warning(...param) {
        if (this.level >= WARNING) {
            this.log('WARNING', param);
        }
    }
    error(...param) {
        if (this.level >= ERROR) {
            this.log('ERROR', param);
        }
    }
    fatal(...param) {
        this.log('FATAL', param);
    }
    log(level, param) {
        if (!this.readonly) {
            const time = new Date();
            const localTime = new Date(time.getTime() - time.getTimezoneOffset() * 60000);
            const timeStr = localTime.toISOString().slice(0, -5).replace('T', ' ');
            const logContent = `[${timeStr}] ${level} ${util_1.format(param)}\n`;
            if (this.writable && this.bufferSerialEmitter) {
                const buffer = new stream_buffers_1.WritableStreamBuffer();
                buffer.write(logContent);
                buffer.end();
                this.bufferSerialEmitter.feed(buffer.getContents());
            }
            else {
                console.log(logContent);
            }
        }
    }
};
Logger = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [String])
], Logger);
exports.Logger = Logger;
function getLogger() {
    return component.get(Logger);
}
exports.getLogger = getLogger;
