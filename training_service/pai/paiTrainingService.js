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
const path = require("path");
const request = require("request");
const component = require("../../common/component");
const events_1 = require("events");
const ts_deferred_1 = require("ts-deferred");
const experimentStartupInfo_1 = require("../../common/experimentStartupInfo");
const log_1 = require("../../common/log");
const errors_1 = require("../../common/errors");
const utils_1 = require("../../common/utils");
const paiJobInfoCollector_1 = require("./paiJobInfoCollector");
let PAITrainingService = class PAITrainingService {
    constructor() {
        this.stopping = false;
        this.versionCheck = true;
        this.isMultiPhase = false;
        this.authFileHdfsPath = undefined;
        this.protocol = 'http';
        this.log = log_1.getLogger();
        this.metricsEmitter = new events_1.EventEmitter();
        this.trialJobsMap = new Map();
        this.jobQueue = [];
        this.expRootDir = path.join('/nni-experiments', experimentStartupInfo_1.getExperimentId());
        this.experimentId = experimentStartupInfo_1.getExperimentId();
        this.paiJobCollector = new paiJobInfoCollector_1.PAIJobInfoCollector(this.trialJobsMap);
        this.paiTokenUpdateInterval = 7200000;
        this.logCollection = 'none';
        this.log.info('Construct paiBase training service.');
    }
    async run() {
        this.log.info('Run PAI training service.');
        if (this.paiJobRestServer === undefined) {
            throw new Error('paiJobRestServer not initialized!');
        }
        await this.paiJobRestServer.start();
        this.paiJobRestServer.setEnableVersionCheck = this.versionCheck;
        this.log.info(`PAI Training service rest server listening on: ${this.paiJobRestServer.endPoint}`);
        await Promise.all([
            this.statusCheckingLoop(),
            this.submitJobLoop()
        ]);
        this.log.info('PAI training service exit.');
    }
    async submitTrialJob(_form) {
        throw new Error('Not implemented!');
    }
    async updateTrialJob(_trialJobId, _form) {
        throw new Error('Not implemented!');
    }
    async submitTrialJobToPAI(_trialJobId) {
        throw new Error('Not implemented!');
    }
    async submitJobLoop() {
        while (!this.stopping) {
            while (!this.stopping && this.jobQueue.length > 0) {
                const trialJobId = this.jobQueue[0];
                if (await this.submitTrialJobToPAI(trialJobId)) {
                    this.jobQueue.shift();
                }
                else {
                    break;
                }
            }
            await utils_1.delay(3000);
        }
    }
    async setClusterMetadata(_key, _value) {
        throw new Error('Not implemented!');
    }
    async listTrialJobs() {
        const jobs = [];
        for (const key of this.trialJobsMap.keys()) {
            jobs.push(await this.getTrialJob(key));
        }
        return jobs;
    }
    async getTrialLog(_trialJobId, _logType) {
        throw new errors_1.MethodNotImplementedError();
    }
    async getTrialJob(trialJobId) {
        if (this.paiClusterConfig === undefined) {
            throw new Error('PAI Cluster config is not initialized');
        }
        const paiTrialJob = this.trialJobsMap.get(trialJobId);
        if (paiTrialJob === undefined) {
            throw new Error(`trial job ${trialJobId} not found`);
        }
        return paiTrialJob;
    }
    addTrialJobMetricListener(listener) {
        this.metricsEmitter.on('metric', listener);
    }
    removeTrialJobMetricListener(listener) {
        this.metricsEmitter.off('metric', listener);
    }
    get isMultiPhaseJobSupported() {
        return true;
    }
    cancelTrialJob(trialJobId, isEarlyStopped = false) {
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            return Promise.reject(new Error(`cancelTrialJob: trial job id ${trialJobId} not found`));
        }
        if (this.paiClusterConfig === undefined) {
            return Promise.reject(new Error('PAI Cluster config is not initialized'));
        }
        if (this.paiToken === undefined) {
            return Promise.reject(new Error('PAI token is not initialized'));
        }
        if (trialJobDetail.status === 'UNKNOWN') {
            trialJobDetail.status = 'USER_CANCELED';
            return Promise.resolve();
        }
        const stopJobRequest = {
            uri: `${this.protocol}://${this.paiClusterConfig.host}/rest-server/api/v2/jobs/${this.paiClusterConfig.userName}~${trialJobDetail.paiJobName}/executionType`,
            method: 'PUT',
            json: true,
            body: { value: 'STOP' },
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.paiToken}`
            }
        };
        trialJobDetail.isEarlyStopped = isEarlyStopped;
        const deferred = new ts_deferred_1.Deferred();
        request(stopJobRequest, (error, response, _body) => {
            if ((error !== undefined && error !== null) || response.statusCode >= 400) {
                this.log.error(`PAI Training service: stop trial ${trialJobId} to PAI Cluster failed!`);
                deferred.reject((error !== undefined && error !== null) ? error.message :
                    `Stop trial failed, http code: ${response.statusCode}`);
            }
            else {
                deferred.resolve();
            }
        });
        return deferred.promise;
    }
    getClusterMetadata(_key) {
        throw new Error('Not implemented!');
    }
    async cleanUp() {
        this.log.info('Stopping PAI training service...');
        this.stopping = true;
        if (this.paiJobRestServer === undefined) {
            throw new Error('paiJobRestServer not initialized!');
        }
        try {
            await this.paiJobRestServer.stop();
            this.log.info('PAI Training service rest server stopped successfully.');
        }
        catch (error) {
            this.log.error(`PAI Training service rest server stopped failed, error: ${error.message}`);
        }
    }
    get MetricsEmitter() {
        return this.metricsEmitter;
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
    async statusCheckingLoop() {
        while (!this.stopping) {
            if (this.paiClusterConfig && this.paiClusterConfig.passWord) {
                try {
                    await this.updatePaiToken();
                }
                catch (error) {
                    this.log.error(`${error}`);
                    if (this.paiToken === undefined) {
                        throw new Error(error);
                    }
                }
            }
            await this.paiJobCollector.retrieveTrialStatus(this.protocol, this.paiToken, this.paiClusterConfig);
            if (this.paiJobRestServer === undefined) {
                throw new Error('paiBaseJobRestServer not implemented!');
            }
            if (this.paiJobRestServer.getErrorMessage !== undefined) {
                throw new Error(this.paiJobRestServer.getErrorMessage);
            }
            await utils_1.delay(3000);
        }
    }
    async updatePaiToken() {
        const deferred = new ts_deferred_1.Deferred();
        const currentTime = new Date().getTime();
        if (this.paiTokenUpdateTime !== undefined && (currentTime - this.paiTokenUpdateTime) < this.paiTokenUpdateInterval) {
            return Promise.resolve();
        }
        if (this.paiClusterConfig === undefined) {
            const paiClusterConfigError = `pai cluster config not initialized!`;
            this.log.error(`${paiClusterConfigError}`);
            throw Error(`${paiClusterConfigError}`);
        }
        const authenticationReq = {
            uri: `${this.protocol}://${this.paiClusterConfig.host}/rest-server/api/v1/token`,
            method: 'POST',
            json: true,
            body: {
                username: this.paiClusterConfig.userName,
                password: this.paiClusterConfig.passWord
            }
        };
        request(authenticationReq, (error, response, body) => {
            if (error !== undefined && error !== null) {
                this.log.error(`Get PAI token failed: ${error.message}`);
                deferred.reject(new Error(`Get PAI token failed: ${error.message}`));
            }
            else {
                if (response.statusCode !== 200) {
                    this.log.error(`Get PAI token failed: get PAI Rest return code ${response.statusCode}`);
                    deferred.reject(new Error(`Get PAI token failed: ${response.body}, please check paiConfig username or password`));
                }
                this.paiToken = body.token;
                this.paiTokenUpdateTime = new Date().getTime();
                deferred.resolve();
            }
        });
        let timeoutId;
        const timeoutDelay = new Promise((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Get PAI token timeout. Please check your PAI cluster.')), 5000);
        });
        return Promise.race([timeoutDelay, deferred.promise])
            .finally(() => { clearTimeout(timeoutId); });
    }
};
PAITrainingService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], PAITrainingService);
exports.PAITrainingService = PAITrainingService;
