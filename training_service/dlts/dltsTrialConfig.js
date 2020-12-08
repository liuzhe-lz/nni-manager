"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const trialConfig_1 = require("training_service/common/trialConfig");
class DLTSTrialConfig extends trialConfig_1.TrialConfig {
    constructor(command, codeDir, gpuNum, image) {
        super(command, codeDir, gpuNum);
        this.image = image;
    }
}
exports.DLTSTrialConfig = DLTSTrialConfig;
