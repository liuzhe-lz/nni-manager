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
const yaml = require("js-yaml");
const request = require("request");
const ts_deferred_1 = require("ts-deferred");
const component = require("../../../common/component");
const experimentStartupInfo_1 = require("../../../common/experimentStartupInfo");
const log_1 = require("../../../common/log");
const trialConfigMetadataKey_1 = require("../../common/trialConfigMetadataKey");
const environment_1 = require("../environment");
const storageService_1 = require("../storageService");
let OpenPaiEnvironmentService = class OpenPaiEnvironmentService extends environment_1.EnvironmentService {
    constructor() {
        super();
        this.log = log_1.getLogger();
        this.protocol = 'http';
        this.experimentId = experimentStartupInfo_1.getExperimentId();
    }
    get environmentMaintenceLoopInterval() {
        return 5000;
    }
    get hasStorageService() {
        return true;
    }
    async config(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.PAI_CLUSTER_CONFIG:
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
                const storageService = component.get(storageService_1.StorageService);
                const remoteRoot = storageService.joinPath(this.paiTrialConfig.nniManagerNFSMountPath, this.experimentId);
                storageService.initialize(this.paiTrialConfig.nniManagerNFSMountPath, remoteRoot);
                if (this.paiTrialConfig.paiConfigPath) {
                    this.paiJobConfig = yaml.safeLoad(fs.readFileSync(this.paiTrialConfig.paiConfigPath, 'utf8'));
                }
                if (this.paiClusterConfig.gpuNum === undefined) {
                    this.paiClusterConfig.gpuNum = this.paiTrialConfig.gpuNum;
                }
                if (this.paiClusterConfig.cpuNum === undefined) {
                    this.paiClusterConfig.cpuNum = this.paiTrialConfig.cpuNum;
                }
                if (this.paiClusterConfig.memoryMB === undefined) {
                    this.paiClusterConfig.memoryMB = this.paiTrialConfig.memoryMB;
                }
                break;
            }
            default:
                this.log.debug(`OpenPAI not proccessed metadata key: '${key}', value: '${value}'`);
        }
    }
    async refreshEnvironmentsStatus(environments) {
        const deferred = new ts_deferred_1.Deferred();
        if (this.paiClusterConfig === undefined) {
            throw new Error('PAI Cluster config is not initialized');
        }
        if (this.paiToken === undefined) {
            throw new Error('PAI token is not initialized');
        }
        const getJobInfoRequest = {
            uri: `${this.protocol}://${this.paiClusterConfig.host}/rest-server/api/v2/jobs?username=${this.paiClusterConfig.userName}`,
            method: 'GET',
            json: true,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.paiToken}`
            }
        };
        request(getJobInfoRequest, async (error, response, body) => {
            if ((error !== undefined && error !== null) || response.statusCode >= 400) {
                const errorMessage = (error !== undefined && error !== null) ? error.message :
                    `OpenPAI: get environment list from PAI Cluster failed!, http code:${response.statusCode}, http body: ${JSON.stringify(body)}`;
                this.log.error(`${errorMessage}`);
                deferred.reject(errorMessage);
            }
            else {
                const jobInfos = new Map();
                body.forEach((jobInfo) => {
                    jobInfos.set(jobInfo.name, jobInfo);
                });
                environments.forEach((environment) => {
                    if (jobInfos.has(environment.envId)) {
                        const jobResponse = jobInfos.get(environment.envId);
                        if (jobResponse && jobResponse.state) {
                            const oldEnvironmentStatus = environment.status;
                            switch (jobResponse.state) {
                                case 'RUNNING':
                                case 'WAITING':
                                case 'SUCCEEDED':
                                    environment.setStatus(jobResponse.state);
                                    break;
                                case 'FAILED':
                                    environment.setStatus(jobResponse.state);
                                    deferred.reject(`OpenPAI: job ${environment.envId} is failed!`);
                                    break;
                                case 'STOPPED':
                                case 'STOPPING':
                                    environment.setStatus('USER_CANCELED');
                                    break;
                                default:
                                    this.log.error(`OpenPAI: job ${environment.envId} returns unknown state ${jobResponse.state}.`);
                                    environment.setStatus('UNKNOWN');
                            }
                            if (oldEnvironmentStatus !== environment.status) {
                                this.log.debug(`OpenPAI: job ${environment.envId} change status ${oldEnvironmentStatus} to ${environment.status} due to job is ${jobResponse.state}.`);
                            }
                        }
                        else {
                            this.log.error(`OpenPAI: job ${environment.envId} has no state returned. body:${JSON.stringify(jobResponse)}`);
                            environment.status = 'FAILED';
                        }
                    }
                    else {
                        this.log.error(`OpenPAI job ${environment.envId} is not found in job list.`);
                        environment.status = 'UNKNOWN';
                    }
                });
                deferred.resolve();
            }
        });
        return deferred.promise;
    }
    async startEnvironment(environment) {
        const deferred = new ts_deferred_1.Deferred();
        if (this.paiClusterConfig === undefined) {
            throw new Error('PAI Cluster config is not initialized');
        }
        if (this.paiToken === undefined) {
            throw new Error('PAI token is not initialized');
        }
        if (this.paiTrialConfig === undefined) {
            throw new Error('PAI trial config is not initialized');
        }
        const environmentRoot = `${this.paiTrialConfig.containerNFSMountPath}/${this.experimentId}`;
        environment.runnerWorkingFolder = `${environmentRoot}/envs/${environment.id}`;
        environment.command = `cd ${environmentRoot} && ${environment.command}`;
        environment.trackingUrl = `${this.protocol}://${this.paiClusterConfig.host}/job-detail.html?username=${this.paiClusterConfig.userName}&jobName=${environment.envId}`;
        environment.useActiveGpu = this.paiClusterConfig.useActiveGpu;
        environment.maxTrialNumberPerGpu = this.paiClusterConfig.maxTrialNumPerGpu;
        const paiJobConfig = this.generateJobConfigInYamlFormat(environment);
        this.log.debug(`generated paiJobConfig: ${paiJobConfig}`);
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
                    `start environment ${environment.envId} failed, http code:${response.statusCode}, http body: ${body}`;
                this.log.error(errorMessage);
                environment.status = 'FAILED';
                deferred.reject(errorMessage);
            }
            deferred.resolve();
        });
        return deferred.promise;
    }
    async stopEnvironment(environment) {
        const deferred = new ts_deferred_1.Deferred();
        if (this.paiClusterConfig === undefined) {
            return Promise.reject(new Error('PAI Cluster config is not initialized'));
        }
        if (this.paiToken === undefined) {
            return Promise.reject(Error('PAI token is not initialized'));
        }
        const stopJobRequest = {
            uri: `${this.protocol}://${this.paiClusterConfig.host}/rest-server/api/v2/jobs/${this.paiClusterConfig.userName}~${environment.envId}/executionType`,
            method: 'PUT',
            json: true,
            body: { value: 'STOP' },
            time: true,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.paiToken}`
            }
        };
        this.log.debug(`stopping OpenPAI environment ${environment.envId}, ${stopJobRequest.uri}`);
        try {
            request(stopJobRequest, (error, response, _body) => {
                try {
                    if ((error !== undefined && error !== null) || (response && response.statusCode >= 400)) {
                        const errorMessage = (error !== undefined && error !== null) ? error.message :
                            `OpenPAI: stop job ${environment.envId} failed, http code:${response.statusCode}, http body: ${_body}`;
                        this.log.error(`${errorMessage}`);
                        deferred.reject((error !== undefined && error !== null) ? error :
                            `Stop trial failed, http code: ${response.statusCode}`);
                    }
                    else {
                        this.log.info(`OpenPAI job ${environment.envId} stopped.`);
                    }
                    deferred.resolve();
                }
                catch (error) {
                    this.log.error(`OpenPAI error when inner stopping environment ${error}`);
                    deferred.reject(error);
                }
            });
        }
        catch (error) {
            this.log.error(`OpenPAI error when stopping environment ${error}`);
            return Promise.reject(error);
        }
        return deferred.promise;
    }
    generateJobConfigInYamlFormat(environment) {
        if (this.paiTrialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        const jobName = environment.envId;
        let nniJobConfig = undefined;
        if (this.paiTrialConfig.paiConfigPath) {
            nniJobConfig = JSON.parse(JSON.stringify(this.paiJobConfig));
            nniJobConfig.name = jobName;
            if (nniJobConfig.taskRoles) {
                environment.nodeCount = 0;
                for (const taskRoleName in nniJobConfig.taskRoles) {
                    const taskRole = nniJobConfig.taskRoles[taskRoleName];
                    let instanceCount = 1;
                    if (taskRole.instances) {
                        instanceCount = taskRole.instances;
                    }
                    environment.nodeCount += instanceCount;
                }
                for (const taskRoleName in nniJobConfig.taskRoles) {
                    const taskRole = nniJobConfig.taskRoles[taskRoleName];
                    const joinedCommand = taskRole.commands.join(" && ").replace("'", "'\\''").trim();
                    const nniTrialCommand = `${environment.command} --node_count ${environment.nodeCount} --trial_command '${joinedCommand}'`;
                    this.log.debug(`replace command ${taskRole.commands} to ${[nniTrialCommand]}`);
                    taskRole.commands = [nniTrialCommand];
                }
            }
        }
        else {
            if (this.paiClusterConfig === undefined) {
                throw new Error('PAI Cluster config is not initialized');
            }
            if (this.paiClusterConfig.gpuNum === undefined) {
                throw new Error('PAI Cluster gpuNum is not initialized');
            }
            if (this.paiClusterConfig.cpuNum === undefined) {
                throw new Error('PAI Cluster cpuNum is not initialized');
            }
            if (this.paiClusterConfig.memoryMB === undefined) {
                throw new Error('PAI Cluster memoryMB is not initialized');
            }
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
                            gpu: this.paiClusterConfig.gpuNum,
                            cpu: this.paiClusterConfig.cpuNum,
                            memoryMB: this.paiClusterConfig.memoryMB
                        },
                        commands: [
                            environment.command
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
    formatPAIHost(host) {
        if (host.startsWith('http://')) {
            this.protocol = 'http';
            return host.replace('http://', '');
        }
        else if (host.startsWith('https://')) {
            this.protocol = 'https';
            return host.replace('https://', '');
        }
        else {
            return host;
        }
    }
};
OpenPaiEnvironmentService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], OpenPaiEnvironmentService);
exports.OpenPaiEnvironmentService = OpenPaiEnvironmentService;
