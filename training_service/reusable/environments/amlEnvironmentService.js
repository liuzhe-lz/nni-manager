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
const path = require("path");
const component = require("../../../common/component");
const experimentStartupInfo_1 = require("../../../common/experimentStartupInfo");
const log_1 = require("../../../common/log");
const utils_1 = require("../../../common/utils");
const trialConfigMetadataKey_1 = require("../../common/trialConfigMetadataKey");
const util_1 = require("../../common/util");
const amlClient_1 = require("../aml/amlClient");
const amlConfig_1 = require("../aml/amlConfig");
const amlCommandChannel_1 = require("../channels/amlCommandChannel");
const environment_1 = require("../environment");
let AMLEnvironmentService = class AMLEnvironmentService extends environment_1.EnvironmentService {
    constructor() {
        super();
        this.log = log_1.getLogger();
        this.experimentId = experimentStartupInfo_1.getExperimentId();
        this.experimentRootDir = utils_1.getExperimentRootDir();
    }
    get hasStorageService() {
        return false;
    }
    createCommandChannel(commandEmitter) {
        return new amlCommandChannel_1.AMLCommandChannel(commandEmitter);
    }
    createEnvironmentInformation(envId, envName) {
        return new amlConfig_1.AMLEnvironmentInformation(envId, envName);
    }
    async config(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.AML_CLUSTER_CONFIG:
                this.amlClusterConfig = JSON.parse(value);
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.TRIAL_CONFIG: {
                if (this.amlClusterConfig === undefined) {
                    this.log.error('aml cluster config is not initialized');
                    break;
                }
                this.amlTrialConfig = JSON.parse(value);
                await util_1.validateCodeDir(this.amlTrialConfig.codeDir);
                break;
            }
            default:
                this.log.debug(`AML not proccessed metadata key: '${key}', value: '${value}'`);
        }
    }
    async refreshEnvironmentsStatus(environments) {
        environments.forEach(async (environment) => {
            const amlClient = environment.amlClient;
            if (!amlClient) {
                return Promise.reject('AML client not initialized!');
            }
            const newStatus = await amlClient.updateStatus(environment.status);
            switch (newStatus.toUpperCase()) {
                case 'WAITING':
                case 'QUEUED':
                    environment.setStatus('WAITING');
                    break;
                case 'RUNNING':
                    environment.setStatus('RUNNING');
                    break;
                case 'COMPLETED':
                case 'SUCCEEDED':
                    environment.setStatus('SUCCEEDED');
                    break;
                case 'FAILED':
                    environment.setStatus('FAILED');
                    return Promise.reject(`AML: job ${environment.envId} is failed!`);
                case 'STOPPED':
                case 'STOPPING':
                    environment.setStatus('USER_CANCELED');
                    break;
                default:
                    environment.setStatus('UNKNOWN');
            }
        });
    }
    async startEnvironment(environment) {
        if (this.amlClusterConfig === undefined) {
            throw new Error('AML Cluster config is not initialized');
        }
        if (this.amlTrialConfig === undefined) {
            throw new Error('AML trial config is not initialized');
        }
        const amlEnvironment = environment;
        const environmentLocalTempFolder = path.join(this.experimentRootDir, this.experimentId, "environment-temp");
        environment.command = `import os\nos.system('${amlEnvironment.command}')`;
        environment.useActiveGpu = this.amlClusterConfig.useActiveGpu;
        environment.maxTrialNumberPerGpu = this.amlClusterConfig.maxTrialNumPerGpu;
        await fs.promises.writeFile(path.join(environmentLocalTempFolder, 'nni_script.py'), amlEnvironment.command, { encoding: 'utf8' });
        const amlClient = new amlClient_1.AMLClient(this.amlClusterConfig.subscriptionId, this.amlClusterConfig.resourceGroup, this.amlClusterConfig.workspaceName, this.experimentId, this.amlClusterConfig.computeTarget, this.amlTrialConfig.image, 'nni_script.py', environmentLocalTempFolder);
        amlEnvironment.id = await amlClient.submit();
        amlEnvironment.trackingUrl = await amlClient.getTrackingUrl();
        amlEnvironment.amlClient = amlClient;
    }
    async stopEnvironment(environment) {
        const amlEnvironment = environment;
        const amlClient = amlEnvironment.amlClient;
        if (!amlClient) {
            throw new Error('AML client not initialized!');
        }
        amlClient.stop();
    }
};
AMLEnvironmentService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], AMLEnvironmentService);
exports.AMLEnvironmentService = AMLEnvironmentService;
