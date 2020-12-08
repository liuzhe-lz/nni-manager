'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const os = require("os");
const path = require("path");
const component = require("../common/component");
let ExperimentStartupInfo = class ExperimentStartupInfo {
    constructor() {
        this.experimentId = '';
        this.newExperiment = true;
        this.basePort = -1;
        this.initialized = false;
        this.logDir = '';
        this.logLevel = '';
        this.readonly = false;
        this.dispatcherPipe = null;
        this.platform = '';
    }
    setStartupInfo(newExperiment, experimentId, basePort, platform, logDir, logLevel, readonly, dispatcherPipe) {
        assert(!this.initialized);
        assert(experimentId.trim().length > 0);
        this.newExperiment = newExperiment;
        this.experimentId = experimentId;
        this.basePort = basePort;
        this.initialized = true;
        this.platform = platform;
        if (logDir !== undefined && logDir.length > 0) {
            this.logDir = path.join(path.normalize(logDir), this.getExperimentId());
        }
        else {
            this.logDir = path.join(os.homedir(), 'nni-experiments', this.getExperimentId());
        }
        if (logLevel !== undefined && logLevel.length > 1) {
            this.logLevel = logLevel;
        }
        if (readonly !== undefined) {
            this.readonly = readonly;
        }
        if (dispatcherPipe != undefined && dispatcherPipe.length > 0) {
            this.dispatcherPipe = dispatcherPipe;
        }
    }
    getExperimentId() {
        assert(this.initialized);
        return this.experimentId;
    }
    getBasePort() {
        assert(this.initialized);
        return this.basePort;
    }
    isNewExperiment() {
        assert(this.initialized);
        return this.newExperiment;
    }
    getPlatform() {
        assert(this.initialized);
        return this.platform;
    }
    getLogDir() {
        assert(this.initialized);
        return this.logDir;
    }
    getLogLevel() {
        assert(this.initialized);
        return this.logLevel;
    }
    isReadonly() {
        assert(this.initialized);
        return this.readonly;
    }
    getDispatcherPipe() {
        assert(this.initialized);
        return this.dispatcherPipe;
    }
};
ExperimentStartupInfo = __decorate([
    component.Singleton
], ExperimentStartupInfo);
exports.ExperimentStartupInfo = ExperimentStartupInfo;
function getExperimentId() {
    return component.get(ExperimentStartupInfo).getExperimentId();
}
exports.getExperimentId = getExperimentId;
function getBasePort() {
    return component.get(ExperimentStartupInfo).getBasePort();
}
exports.getBasePort = getBasePort;
function isNewExperiment() {
    return component.get(ExperimentStartupInfo).isNewExperiment();
}
exports.isNewExperiment = isNewExperiment;
function getPlatform() {
    return component.get(ExperimentStartupInfo).getPlatform();
}
exports.getPlatform = getPlatform;
function getExperimentStartupInfo() {
    return component.get(ExperimentStartupInfo);
}
exports.getExperimentStartupInfo = getExperimentStartupInfo;
function setExperimentStartupInfo(newExperiment, experimentId, basePort, platform, logDir, logLevel, readonly, dispatcherPipe) {
    component.get(ExperimentStartupInfo)
        .setStartupInfo(newExperiment, experimentId, basePort, platform, logDir, logLevel, readonly, dispatcherPipe);
}
exports.setExperimentStartupInfo = setExperimentStartupInfo;
function isReadonly() {
    return component.get(ExperimentStartupInfo).isReadonly();
}
exports.isReadonly = isReadonly;
function getDispatcherPipe() {
    return component.get(ExperimentStartupInfo).getDispatcherPipe();
}
exports.getDispatcherPipe = getDispatcherPipe;
