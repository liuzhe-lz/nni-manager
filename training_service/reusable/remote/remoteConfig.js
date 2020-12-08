"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const environment_1 = require("../environment");
class RemoteMachineEnvironmentInformation extends environment_1.EnvironmentInformation {
}
exports.RemoteMachineEnvironmentInformation = RemoteMachineEnvironmentInformation;
class RemoteConfig {
    constructor(reuse) {
        this.reuse = reuse;
    }
}
exports.RemoteConfig = RemoteConfig;
