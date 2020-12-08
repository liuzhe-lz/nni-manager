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
const request = require("request");
const component = require("../../common/component");
const events_1 = require("events");
const typescript_string_operations_1 = require("typescript-string-operations");
const experimentStartupInfo_1 = require("../../common/experimentStartupInfo");
const log_1 = require("../../common/log");
const errors_1 = require("../../common/errors");
const dltsData_1 = require("./dltsData");
const containerJobData_1 = require("../common/containerJobData");
const util_1 = require("../common/util");
const utils_1 = require("../../common/utils");
const dltsJobRestServer_1 = require("./dltsJobRestServer");
const trialConfigMetadataKey_1 = require("../../training_service/common/trialConfigMetadataKey");
const dltsJobConfig_1 = require("./dltsJobConfig");
const dltsTrialJobDetail_1 = require("./dltsTrialJobDetail");
let DLTSTrainingService = class DLTSTrainingService {
    constructor() {
        this.stopping = false;
        this.versionCheck = true;
        this.logCollection = 'none';
        this.isMultiPhase = false;
        this.log = log_1.getLogger();
        this.metricsEmitter = new events_1.EventEmitter();
        this.trialJobsMap = new Map();
        this.jobQueue = [];
        this.experimentId = experimentStartupInfo_1.getExperimentId();
        this.dltsRestServerHost = utils_1.getIPV4Address();
        this.jobMode = 'DLTS_JOB_ID' in process.env;
        this.log.info(`Construct DLTS training service in ${this.jobMode ? 'job mode' : 'local mode'}.`);
    }
    async run() {
        this.log.info('Run DLTS training service.');
        const restServer = component.get(dltsJobRestServer_1.DLTSJobRestServer);
        await restServer.start();
        restServer.setEnableVersionCheck = this.versionCheck;
        this.log.info(`DLTS Training service rest server listening on: ${restServer.endPoint}`);
        if (this.jobMode) {
            await this.exposeRestServerPort(restServer.clusterRestServerPort);
        }
        else {
            this.dltsRestServerPort = restServer.clusterRestServerPort;
        }
        await Promise.all([
            this.statusCheckingLoop(),
            this.submitJobLoop()
        ]);
        this.log.info('DLTS training service exit.');
    }
    async exposeRestServerPort(port) {
        if (this.dltsClusterConfig == null) {
            throw Error('Cluster config is not set');
        }
        const { dashboard, cluster, email, password } = this.dltsClusterConfig;
        const jobId = process.env['DLTS_JOB_ID'] + '';
        const uri = `${dashboard}api/clusters/${cluster}/jobs/${jobId}/endpoints`;
        const qs = { email, password };
        do {
            this.log.debug('Checking endpoints');
            const endpoints = await new Promise((resolve, reject) => {
                request.get(uri, { qs, json: true }, function (error, response, body) {
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(body);
                    }
                });
            });
            this.log.debug('Endpoints: %o', endpoints);
            if (Array.isArray(endpoints)) {
                const restServerEndpoint = endpoints.find(({ podPort }) => podPort === port);
                if (restServerEndpoint == null) {
                    this.log.debug('Exposing %d', port);
                    await new Promise((resolve, reject) => {
                        request.post(uri, {
                            qs,
                            json: true,
                            body: {
                                endpoints: [{
                                        name: "nni-rest-server",
                                        podPort: port
                                    }]
                            }
                        }, function (error) {
                            if (error) {
                                reject(error);
                            }
                            else {
                                resolve();
                            }
                        });
                    });
                }
                else if (restServerEndpoint['status'] === 'running') {
                    this.dltsRestServerHost = restServerEndpoint['nodeName'];
                    this.dltsRestServerPort = restServerEndpoint['port'];
                    break;
                }
            }
        } while (await new Promise(resolve => setTimeout(resolve, 1000, true)));
    }
    async statusCheckingLoop() {
        while (!this.stopping) {
            const updateDLTSTrialJobs = [];
            for (const dltsTrialJob of this.trialJobsMap.values()) {
                updateDLTSTrialJobs.push(this.getDLTSTrialJobInfo(dltsTrialJob));
            }
            await Promise.all(updateDLTSTrialJobs);
            const cancelPausedJobPromises = [];
            for (const [trialJobId, dltsTrialJob] of this.trialJobsMap) {
                if (dltsTrialJob.dltsPaused && dltsTrialJob.status === 'RUNNING') {
                    cancelPausedJobPromises.push(this.cancelTrialJob(trialJobId));
                }
            }
            await Promise.all(cancelPausedJobPromises);
            const restServer = component.get(dltsJobRestServer_1.DLTSJobRestServer);
            if (restServer.getErrorMessage !== undefined) {
                throw new Error(restServer.getErrorMessage);
            }
            await utils_1.delay(3000);
        }
    }
    async getDLTSTrialJobInfo(dltsTrialJob) {
        if (this.dltsClusterConfig == null) {
            throw Error('Cluster config is not set');
        }
        const requestOptions = {
            uri: `${this.dltsClusterConfig.dashboard}api/v2/clusters/${this.dltsClusterConfig.cluster}/jobs/${dltsTrialJob.dltsJobId}`,
            qs: {
                email: this.dltsClusterConfig.email,
                password: this.dltsClusterConfig.password
            },
            json: true
        };
        const body = await new Promise((resolve, reject) => {
            request(requestOptions, (error, response, body) => {
                if (error != null) {
                    reject(error);
                }
                else {
                    resolve(body);
                }
            });
        });
        void (() => {
            switch (body['jobStatus']) {
                case 'unapproved':
                case 'queued':
                case 'scheduling':
                    dltsTrialJob.status = "WAITING";
                    break;
                case 'running':
                    dltsTrialJob.status = "RUNNING";
                    if (dltsTrialJob.startTime === undefined) {
                        dltsTrialJob.startTime = Date.parse(body['jobStatusDetail'][0]['startedAt']);
                    }
                    if (dltsTrialJob.url === undefined) {
                        dltsTrialJob.url = `${this.dltsClusterConfig.dashboard}job/${this.dltsClusterConfig.team}/${this.dltsClusterConfig.cluster}/${dltsTrialJob.dltsJobId}`;
                    }
                    break;
                case 'finished':
                    dltsTrialJob.status = "SUCCEEDED";
                    break;
                case 'failed':
                    dltsTrialJob.status = "FAILED";
                    break;
                case 'pausing':
                case 'paused':
                    dltsTrialJob.status = "RUNNING";
                    dltsTrialJob.dltsPaused = true;
                    break;
                case 'killing':
                case 'killed':
                    if (dltsTrialJob.isEarlyStopped !== undefined) {
                        dltsTrialJob.status = dltsTrialJob.isEarlyStopped === true
                            ? 'EARLY_STOPPED' : 'USER_CANCELED';
                    }
                    else {
                        dltsTrialJob.status = 'SYS_CANCELED';
                    }
                    break;
                default:
                    dltsTrialJob.status = "UNKNOWN";
            }
        })();
    }
    async submitJobLoop() {
        while (!this.stopping) {
            while (!this.stopping && this.jobQueue.length > 0) {
                const trialJobId = this.jobQueue[0];
                this.log.info(`Got job ${trialJobId}`);
                if (await this.submitTrialJobToDLTS(trialJobId)) {
                    this.jobQueue.shift();
                }
                else {
                    break;
                }
            }
            await utils_1.delay(3000);
        }
    }
    async listTrialJobs() {
        return Array.from(this.trialJobsMap.values());
    }
    async getTrialJob(trialJobId) {
        const trialJob = this.trialJobsMap.get(trialJobId);
        if (trialJob === undefined) {
            throw Error(`Trial job ${trialJobId} not found.`);
        }
        return trialJob;
    }
    async getTrialLog(_trialJobId, _logType) {
        throw new errors_1.MethodNotImplementedError();
    }
    addTrialJobMetricListener(listener) {
        this.metricsEmitter.on('metric', listener);
    }
    removeTrialJobMetricListener(listener) {
        this.metricsEmitter.off('metric', listener);
    }
    get MetricsEmitter() {
        return this.metricsEmitter;
    }
    async submitTrialJob(form) {
        const trialJobId = utils_1.uniqueString(5);
        const trialWorkingFolder = path.join('/nni-experiments', experimentStartupInfo_1.getExperimentId(), '/trials/', trialJobId);
        const trialJobDetail = new dltsTrialJobDetail_1.DLTSTrialJobDetail(trialJobId, 'WAITING', Date.now(), trialWorkingFolder, form, `nni_exp_${this.experimentId}_trial_${trialJobId}`);
        this.trialJobsMap.set(trialJobId, trialJobDetail);
        this.jobQueue.push(trialJobId);
        return trialJobDetail;
    }
    async cancelTrialJob(trialJobId, isEarlyStopped = false) {
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            throw Error(`cancelTrialJob: trial job id ${trialJobId} not found`);
        }
        if (this.dltsClusterConfig === undefined) {
            throw Error('DLTS Cluster config is not initialized');
        }
        const options = {
            method: 'PUT',
            uri: `${this.dltsClusterConfig.dashboard}api/clusters/${this.dltsClusterConfig.cluster}/jobs/${trialJobDetail.dltsJobId}/status`,
            qs: {
                email: this.dltsClusterConfig.email,
                password: this.dltsClusterConfig.password
            },
            body: {
                status: 'killing'
            },
            json: true
        };
        trialJobDetail.isEarlyStopped = isEarlyStopped;
        await new Promise((resolve, reject) => {
            request(options, (error, response, body) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(body);
                }
            });
        });
    }
    async getGpuType() {
        if (this.dltsClusterConfig === undefined) {
            throw new Error('DLTS Cluster config is not initialized');
        }
        const gpuRequestOptions = {
            method: 'GET',
            qs: {
                email: this.dltsClusterConfig.email,
                password: this.dltsClusterConfig.password
            },
            uri: `${this.dltsClusterConfig.dashboard}api/teams/${this.dltsClusterConfig.team}/clusters/${this.dltsClusterConfig.cluster}`,
            json: true
        };
        return new Promise((resolve, reject) => {
            request(gpuRequestOptions, (error, response, data) => {
                if (error) {
                    return reject(error);
                }
                try {
                    const metadata = JSON.parse(data['metadata']);
                    resolve(Object.keys(metadata)[0]);
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    async setClusterMetadata(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.NNI_MANAGER_IP:
                this.nniManagerIpConfig = JSON.parse(value);
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.DLTS_CLUSTER_CONFIG:
                this.dltsClusterConfig = JSON.parse(value);
                if (!this.dltsClusterConfig.cluster) {
                    this.dltsClusterConfig.cluster = '.default';
                }
                if (!this.dltsClusterConfig.email) {
                    if (process.env['DLWS_USER_EMAIL']) {
                        this.dltsClusterConfig.email = process.env['DLWS_USER_EMAIL'];
                    }
                    else {
                        throw Error('`email` field in `dltsConfig` is not configured.');
                    }
                }
                if (!this.dltsClusterConfig.password) {
                    if (process.env['DLTS_JOB_TOKEN']) {
                        this.dltsClusterConfig.password = process.env['DLTS_JOB_TOKEN'];
                    }
                    else {
                        throw Error('`password` field in `dltsConfig` is not configured.');
                    }
                }
                if (!this.dltsClusterConfig.team) {
                    if (process.env['DLWS_VC_NAME']) {
                        this.dltsClusterConfig.team = process.env['DLWS_VC_NAME'];
                    }
                    else {
                        throw Error('`team` field in `dltsConfig` is not configured.');
                    }
                }
                this.dltsClusterConfig.gpuType = await this.getGpuType();
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.TRIAL_CONFIG:
                this.dltsTrialConfig = JSON.parse(value);
                try {
                    await util_1.validateCodeDir(this.dltsTrialConfig.codeDir);
                }
                catch (error) {
                    this.log.error(error);
                    throw error;
                }
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.VERSION_CHECK:
                this.versionCheck = (value === 'true' || value === 'True');
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.LOG_COLLECTION:
                this.logCollection = value;
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.MULTI_PHASE:
                this.isMultiPhase = (value === 'true' || value === 'True');
                break;
            default:
                throw new Error(`Uknown key: ${key}`);
        }
    }
    async getClusterMetadata(_key) {
        return '';
    }
    async cleanUp() {
        this.log.info('Stopping DLTS training service...');
        this.stopping = true;
        const restServer = component.get(dltsJobRestServer_1.DLTSJobRestServer);
        try {
            await restServer.stop();
            this.log.info('DLTS Training service rest server stopped successfully.');
            return;
        }
        catch (error) {
            this.log.error(`DLTS Training service rest server stopped failed, error: ${error.message}`);
            throw error;
        }
    }
    async submitTrialJobToDLTS(trialJobId) {
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            throw new Error(`Failed to find DLTSTrialJobDetail for job ${trialJobId}`);
        }
        if (this.dltsClusterConfig === undefined) {
            throw new Error('DLTS Cluster config is not initialized');
        }
        if (this.dltsTrialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        if (this.dltsRestServerPort === undefined) {
            const restServer = component.get(dltsJobRestServer_1.DLTSJobRestServer);
            this.dltsRestServerPort = restServer.clusterRestServerPort;
        }
        const trialLocalFolder = path.join(utils_1.getExperimentRootDir(), 'trials-local', trialJobId);
        await util_1.execMkdir(trialLocalFolder);
        const runScriptContent = containerJobData_1.CONTAINER_INSTALL_NNI_SHELL_FORMAT;
        await fs.promises.writeFile(path.join(trialLocalFolder, 'install_nni.sh'), runScriptContent, { encoding: 'utf8' });
        if (trialJobDetail.form !== undefined) {
            await fs.promises.writeFile(path.join(trialLocalFolder, utils_1.generateParamFileName(trialJobDetail.form.hyperParameters)), trialJobDetail.form.hyperParameters.value, { encoding: 'utf8' });
        }
        const nniManagerIp = this.nniManagerIpConfig ? this.nniManagerIpConfig.nniManagerIp : this.dltsRestServerHost;
        const version = this.versionCheck ? await utils_1.getVersion() : '';
        const nniDLTSTrialCommand = typescript_string_operations_1.String.Format(dltsData_1.DLTS_TRIAL_COMMAND_FORMAT, trialLocalFolder, path.join(trialLocalFolder, 'nnioutput'), trialJobId, this.experimentId, trialJobDetail.form.sequenceId, false, this.dltsTrialConfig.codeDir, this.dltsTrialConfig.command, nniManagerIp, this.dltsRestServerPort, version, this.logCollection)
            .replace(/\r\n|\n|\r/gm, '');
        const dltsJobConfig = new dltsJobConfig_1.DLTSJobConfig(this.dltsClusterConfig, trialJobDetail.dltsJobName, this.dltsTrialConfig.gpuNum, this.dltsTrialConfig.image, nniDLTSTrialCommand, []);
        const submitJobRequest = {
            method: 'POST',
            uri: `${this.dltsClusterConfig.dashboard}api/clusters/${this.dltsClusterConfig.cluster}/jobs`,
            qs: {
                email: this.dltsClusterConfig.email,
                password: this.dltsClusterConfig.password
            },
            body: dltsJobConfig,
            json: true
        };
        const responseData = await new Promise((resolve, reject) => {
            request(submitJobRequest, function (error, response, data) {
                if (error) {
                    return reject(error);
                }
                else {
                    return resolve(data);
                }
            });
        });
        trialJobDetail.dltsJobId = responseData['jobId'];
        return true;
    }
    async updateTrialJob(trialJobId, form) {
        const trialJobDetail = this.trialJobsMap.get(trialJobId);
        if (trialJobDetail === undefined) {
            throw new Error(`updateTrialJob failed: ${trialJobId} not found`);
        }
        if (this.dltsClusterConfig === undefined) {
            throw new Error('DLTS Cluster config is not initialized');
        }
        if (this.dltsTrialConfig === undefined) {
            throw new Error('DLTS trial config is not initialized');
        }
        const hyperParameters = form.hyperParameters;
        const trialLocalTempFolder = path.join(utils_1.getExperimentRootDir(), 'trials-local', trialJobId);
        const hpFileName = utils_1.generateParamFileName(hyperParameters);
        const localFilepath = path.join(trialLocalTempFolder, hpFileName);
        await fs.promises.writeFile(localFilepath, hyperParameters.value, { encoding: 'utf8' });
        const parameterFileMeta = {
            experimentId: this.experimentId,
            trialId: trialJobId
        };
        const restServer = component.get(dltsJobRestServer_1.DLTSJobRestServer);
        const req = {
            uri: `${restServer.endPoint}${restServer.apiRootUrl}/parameter-file-meta`,
            method: 'POST',
            json: true,
            body: parameterFileMeta
        };
        await new Promise((resolve, reject) => {
            request(req, (err, _res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
        return trialJobDetail;
    }
    get isMultiPhaseJobSupported() {
        return false;
    }
};
DLTSTrainingService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], DLTSTrainingService);
exports.DLTSTrainingService = DLTSTrainingService;
