'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const trialConfig_1 = require("../../common/trialConfig");
const environment_1 = require("../environment");
class AMLClusterConfig {
    constructor(subscriptionId, resourceGroup, workspaceName, computeTarget, useActiveGpu, maxTrialNumPerGpu) {
        this.subscriptionId = subscriptionId;
        this.resourceGroup = resourceGroup;
        this.workspaceName = workspaceName;
        this.computeTarget = computeTarget;
        this.useActiveGpu = useActiveGpu;
        this.maxTrialNumPerGpu = maxTrialNumPerGpu;
    }
}
exports.AMLClusterConfig = AMLClusterConfig;
class AMLTrialConfig extends trialConfig_1.TrialConfig {
    constructor(codeDir, command, image) {
        super("", codeDir, 0);
        this.codeDir = codeDir;
        this.command = command;
        this.image = image;
    }
}
exports.AMLTrialConfig = AMLTrialConfig;
class AMLEnvironmentInformation extends environment_1.EnvironmentInformation {
    constructor() {
        super(...arguments);
        this.currentMessageIndex = -1;
    }
}
exports.AMLEnvironmentInformation = AMLEnvironmentInformation;
