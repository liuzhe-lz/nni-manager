'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class TrialConfig {
    constructor(command, codeDir, gpuNum) {
        this.reuseEnvironment = true;
        this.command = command;
        this.codeDir = codeDir;
        this.gpuNum = gpuNum;
    }
}
exports.TrialConfig = TrialConfig;
