"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PAIK8STrainingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
'use strict';
const fs = require("fs");
const path = require("path");
const request = require("request");
const component = require("../../../common/component");
const ts_deferred_1 = require("ts-deferred");
const typescript_string_operations_1 = require("typescript-string-operations");
const utils_1 = require("../../../common/utils");
const containerJobData_1 = require("../../common/containerJobData");
const trialConfigMetadataKey_1 = require("../../common/trialConfigMetadataKey");
const util_1 = require("../../common/util");
const paiK8SData_1 = require("./paiK8SData");
const paiTrainingService_1 = require("../paiTrainingService");
const paiConfig_1 = require("../paiConfig");
const paiJobRestServer_1 = require("../paiJobRestServer");
const yaml = require('js-yaml');
let PAIK8STrainingService = PAIK8STrainingService_1 = class PAIK8STrainingService extends paiTrainingService_1.PAITrainingService {
    constructor() {
        super();
    }
    async setClusterMetadata(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.NNI_MANAGER_IP:
                this.nniManagerIpConfig = JSON.parse(value);
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.PAI_CLUSTER_CONFIG:
                this.paiJobRestServer = new paiJobRestServer_1.PAIJobRestServer(component.get(PAIK8STrainingService_1));
                this.paiClusterConfig = JSON.parse(value);
                this.paiClusterConfig.host = this.formatPAIHost(this.paiClusterConfig.host);
                this.paiToken = this.paiClusterConfig.token;
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.TRIAL_CONFIG: {
                if (this.paiClusterConfig === undefined) {
                    this.log.error('pai cluster config is not initialized');
                    break;
                }
                this.paiTrialConfig = JSON.parse(value);
                await util_1.validateCodeDir(this.paiTrialConfig.codeDir);
                const nniManagerNFSExpCodeDir = path.join(this.paiTrialConfig.nniManagerNFSMountPath, this.experimentId, 'nni-code');
                await util_1.execMkdir(nniManagerNFSExpCodeDir);
                this.log.info(`Starting copy codeDir data from ${this.paiTrialConfig.codeDir} to ${nniManagerNFSExpCodeDir}`);
                this.copyExpCodeDirPromise = util_1.execCopydir(this.paiTrialConfig.codeDir, nniManagerNFSExpCodeDir);
                if (this.paiTrialConfig.paiConfigPath) {
                    this.paiJobConfig = yaml.safeLoad(fs.readFileSync(this.paiTrialConfig.paiConfigPath, 'utf8'));
                }
                break;
            }
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.VERSION_CHECK:
                this.versionCheck = (value === 'true' || value === 'True');
                this.nniVersion = this.versionCheck ? await utils_1.getVersion() : '';
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.LOG_COLLECTION:
                this.logCollection = value;
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.MULTI_PHASE:
                this.isMultiPhase = (value === 'true' || value === 'True');
                break;
            default:
                this.log.error(`Uknown key: ${key}`);
        }
    }
    async updateTrialJob(trialJobId, form) {
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            throw new Error(`updateTrialJob failed: ${trialJobId} not found`);
        }
        await this.writeParameterFile(trialJobDetail.logPath, form.hyperParameters);
        return trialJobDetail;
    }
    async submitTrialJob(form) {
        if (this.paiClusterConfig === undefined) {
            throw new Error(`paiClusterConfig not initialized!`);
        }
        if (this.paiTrialConfig === undefined) {
            throw new Error(`paiTrialConfig not initialized!`);
        }
        this.log.info(`submitTrialJob: form: ${JSON.stringify(form)}`);
        const trialJobId = utils_1.uniqueString(5);
        const trialWorkingFolder = path.join(this.expRootDir, 'trials', trialJobId);
        const paiJobName = `nni_exp_${this.experimentId}_trial_${trialJobId}`;
        const logPath = path.join(this.paiTrialConfig.nniManagerNFSMountPath, this.experimentId, trialJobId);
        const paiJobDetailUrl = `${this.protocol}://${this.paiClusterConfig.host}/job-detail.html?username=${this.paiClusterConfig.userName}&jobName=${paiJobName}`;
        const trialJobDetail = new paiConfig_1.PAITrialJobDetail(trialJobId, 'WAITING', paiJobName, Date.now(), trialWorkingFolder, form, logPath, paiJobDetailUrl);
        this.trialJobsMap.set(trialJobId, trialJobDetail);
        this.jobQueue.push(trialJobId);
        return trialJobDetail;
    }
    generateNNITrialCommand(trialJobDetail, command) {
        if (this.paiTrialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        const containerNFSExpCodeDir = `${this.paiTrialConfig.containerNFSMountPath}/${this.experimentId}/nni-code`;
        const containerWorkingDir = `${this.paiTrialConfig.containerNFSMountPath}/${this.experimentId}/${trialJobDetail.id}`;
        const nniManagerIp = this.nniManagerIpConfig ? this.nniManagerIpConfig.nniManagerIp : utils_1.getIPV4Address();
        const nniPaiTrialCommand = typescript_string_operations_1.String.Format(paiK8SData_1.PAI_K8S_TRIAL_COMMAND_FORMAT, `${containerWorkingDir}`, `${containerWorkingDir}/nnioutput`, trialJobDetail.id, this.experimentId, trialJobDetail.form.sequenceId, this.isMultiPhase, containerNFSExpCodeDir, command, nniManagerIp, this.paiRestServerPort, this.nniVersion, this.logCollection)
            .replace(/\r\n|\n|\r/gm, '');
        return nniPaiTrialCommand;
    }
    generateJobConfigInYamlFormat(trialJobDetail) {
        if (this.paiTrialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        const jobName = `nni_exp_${this.experimentId}_trial_${trialJobDetail.id}`;
        let nniJobConfig = undefined;
        if (this.paiTrialConfig.paiConfigPath) {
            nniJobConfig = JSON.parse(JSON.stringify(this.paiJobConfig));
            nniJobConfig.name = jobName;
            for (const taskRoleIndex in nniJobConfig.taskRoles) {
                const commands = nniJobConfig.taskRoles[taskRoleIndex].commands;
                const nniTrialCommand = this.generateNNITrialCommand(trialJobDetail, commands.join(" && ").replace(/(["'$`\\])/g, '\\$1'));
                nniJobConfig.taskRoles[taskRoleIndex].commands = [nniTrialCommand];
            }
        }
        else {
            nniJobConfig = {
                protocolVersion: 2,
                name: jobName,
                type: 'job',
                jobRetryCount: 0,
                prerequisites: [
                    {
                        type: 'dockerimage',
                        uri: this.paiTrialConfig.image,
                        name: 'docker_image_0'
                    }
                ],
                taskRoles: {
                    taskrole: {
                        instances: 1,
                        completion: {
                            minFailedInstances: 1,
                            minSucceededInstances: -1
                        },
                        taskRetryCount: 0,
                        dockerImage: 'docker_image_0',
                        resourcePerInstance: {
                            gpu: this.paiTrialConfig.gpuNum,
                            cpu: this.paiTrialConfig.cpuNum,
                            memoryMB: this.paiTrialConfig.memoryMB
                        },
                        commands: [
                            this.generateNNITrialCommand(trialJobDetail, this.paiTrialConfig.command)
                        ]
                    }
                },
                extras: {
                    'storages': [
                        {
                            name: this.paiTrialConfig.paiStorageConfigName
                        }
                    ],
                    submitFrom: 'submit-job-v2'
                }
            };
            if (this.paiTrialConfig.virtualCluster) {
                nniJobConfig.defaults = {
                    virtualCluster: this.paiTrialConfig.virtualCluster
                };
            }
        }
        return yaml.safeDump(nniJobConfig);
    }
    async submitTrialJobToPAI(trialJobId) {
        const deferred = new ts_deferred_1.Deferred();
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            throw new Error(`Failed to find PAITrialJobDetail for job ${trialJobId}`);
        }
        if (this.paiClusterConfig === undefined) {
            throw new Error('PAI Cluster config is not initialized');
        }
        if (this.paiTrialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        if (this.paiToken === undefined) {
            throw new Error('PAI token is not initialized');
        }
        if (this.paiJobRestServer === undefined) {
            throw new Error('paiJobRestServer is not initialized');
        }
        if (this.copyExpCodeDirPromise !== undefined) {
            await this.copyExpCodeDirPromise;
            this.log.info(`Copy codeDir data finished.`);
            this.copyExpCodeDirPromise = undefined;
        }
        this.paiRestServerPort = this.paiJobRestServer.clusterRestServerPort;
        await util_1.execMkdir(trialJobDetail.logPath);
        await fs.promises.writeFile(path.join(trialJobDetail.logPath, 'install_nni.sh'), containerJobData_1.CONTAINER_INSTALL_NNI_SHELL_FORMAT, { encoding: 'utf8' });
        if (trialJobDetail.form !== undefined) {
            await this.writeParameterFile(trialJobDetail.logPath, trialJobDetail.form.hyperParameters);
        }
        const paiJobConfig = this.generateJobConfigInYamlFormat(trialJobDetail);
        this.log.debug(paiJobConfig);
        const submitJobRequest = {
            uri: `${this.protocol}://${this.paiClusterConfig.host}/rest-server/api/v2/jobs`,
            method: 'POST',
            body: paiJobConfig,
            followAllRedirects: true,
            headers: {
                'Content-Type': 'text/yaml',
                Authorization: `Bearer ${this.paiToken}`
            }
        };
        request(submitJobRequest, (error, response, body) => {
            if ((error !== undefined && error !== null) || response.statusCode >= 400) {
                const errorMessage = (error !== undefined && error !== null) ? error.message :
                    `Submit trial ${trialJobId} failed, http code:${response.statusCode}, http body: ${body}`;
                this.log.error(errorMessage);
                trialJobDetail.status = 'FAILED';
                deferred.reject(errorMessage);
            }
            else {
                trialJobDetail.submitTime = Date.now();
            }
            deferred.resolve(true);
        });
        return deferred.promise;
    }
    async writeParameterFile(directory, hyperParameters) {
        const filepath = path.join(directory, utils_1.generateParamFileName(hyperParameters));
        await fs.promises.writeFile(filepath, hyperParameters.value, { encoding: 'utf8' });
    }
};
PAIK8STrainingService = PAIK8STrainingService_1 = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], PAIK8STrainingService);
exports.PAIK8STrainingService = PAIK8STrainingService;
