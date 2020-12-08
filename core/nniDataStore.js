'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const ts_deferred_1 = require("ts-deferred");
const component = require("../common/component");
const datastore_1 = require("../common/datastore");
const errors_1 = require("../common/errors");
const experimentStartupInfo_1 = require("../common/experimentStartupInfo");
const log_1 = require("../common/log");
const utils_1 = require("../common/utils");
class NNIDataStore {
    constructor() {
        this.db = component.get(datastore_1.Database);
        this.log = log_1.getLogger();
    }
    init() {
        if (this.initTask !== undefined) {
            return this.initTask.promise;
        }
        this.initTask = new ts_deferred_1.Deferred();
        const databaseDir = utils_1.getDefaultDatabaseDir();
        if (experimentStartupInfo_1.isNewExperiment()) {
            utils_1.mkDirP(databaseDir).then(() => {
                this.db.init(true, databaseDir).then(() => {
                    this.log.info('Datastore initialization done');
                    this.initTask.resolve();
                }).catch((err) => {
                    this.initTask.reject(err);
                });
            }).catch((err) => {
                this.initTask.reject(err);
            });
        }
        else {
            this.db.init(false, databaseDir).then(() => {
                this.log.info('Datastore initialization done');
                this.initTask.resolve();
            }).catch((err) => {
                this.initTask.reject(err);
            });
        }
        return this.initTask.promise;
    }
    async close() {
        await this.db.close();
    }
    async storeExperimentProfile(experimentProfile) {
        try {
            await this.db.storeExperimentProfile(experimentProfile);
        }
        catch (err) {
            throw errors_1.NNIError.FromError(err, 'Datastore error: ');
        }
    }
    getExperimentProfile(experimentId) {
        return this.db.queryLatestExperimentProfile(experimentId);
    }
    storeTrialJobEvent(event, trialJobId, hyperParameter, jobDetail) {
        this.log.debug(`storeTrialJobEvent: event: ${event}, data: ${hyperParameter}, jobDetail: ${JSON.stringify(jobDetail)}`);
        let timestamp;
        if (event === 'WAITING' && jobDetail) {
            timestamp = jobDetail.submitTime;
        }
        else if (event === 'RUNNING' && jobDetail) {
            timestamp = jobDetail.startTime;
        }
        else if (['EARLY_STOPPED', 'SUCCEEDED', 'FAILED', 'USER_CANCELED', 'SYS_CANCELED'].includes(event) && jobDetail) {
            timestamp = jobDetail.endTime;
        }
        if (timestamp === undefined) {
            timestamp = Date.now();
        }
        return this.db.storeTrialJobEvent(event, trialJobId, timestamp, hyperParameter, jobDetail).catch((err) => {
            throw errors_1.NNIError.FromError(err, 'Datastore error: ');
        });
    }
    async getTrialJobStatistics() {
        const result = [];
        const jobs = await this.listTrialJobs();
        const map = new Map();
        jobs.forEach((value) => {
            let n = map.get(value.status);
            if (!n) {
                n = 0;
            }
            map.set(value.status, n + 1);
        });
        map.forEach((value, key) => {
            const statistics = {
                trialJobStatus: key,
                trialJobNumber: value
            };
            result.push(statistics);
        });
        return result;
    }
    listTrialJobs(status) {
        return this.queryTrialJobs(status);
    }
    async getTrialJob(trialJobId) {
        const trialJobs = await this.queryTrialJobs(undefined, trialJobId);
        assert(trialJobs.length <= 1);
        return trialJobs[0];
    }
    async storeMetricData(trialJobId, data) {
        const metrics = JSON.parse(data);
        if (metrics.type === 'REQUEST_PARAMETER') {
            return;
        }
        assert(trialJobId === metrics.trial_job_id);
        try {
            await this.db.storeMetricData(trialJobId, JSON.stringify({
                trialJobId: metrics.trial_job_id,
                parameterId: metrics.parameter_id,
                type: metrics.type,
                sequence: metrics.sequence,
                data: metrics.value,
                timestamp: Date.now()
            }));
        }
        catch (err) {
            throw errors_1.NNIError.FromError(err, 'Datastore error');
        }
    }
    getMetricData(trialJobId, metricType) {
        return this.db.queryMetricData(trialJobId, metricType);
    }
    async exportTrialHpConfigs() {
        const jobs = await this.listTrialJobs();
        const exportedData = [];
        for (const job of jobs) {
            if (job.hyperParameters && job.finalMetricData) {
                if (job.hyperParameters.length === 1 && job.finalMetricData.length === 1) {
                    const parameters = JSON.parse(job.hyperParameters[0]);
                    const oneEntry = {
                        parameter: parameters.parameters,
                        value: JSON.parse(job.finalMetricData[0].data),
                        trialJobId: job.trialJobId
                    };
                    exportedData.push(oneEntry);
                }
                else {
                    const paraMap = new Map();
                    const metricMap = new Map();
                    for (const eachPara of job.hyperParameters) {
                        const parameters = JSON.parse(eachPara);
                        paraMap.set(parameters.parameter_id, parameters.parameters);
                    }
                    for (const eachMetric of job.finalMetricData) {
                        const value = JSON.parse(eachMetric.data);
                        metricMap.set(Number(eachMetric.parameterId), value);
                    }
                    paraMap.forEach((value, key) => {
                        const metricValue = metricMap.get(key);
                        if (metricValue) {
                            const oneEntry = {
                                parameter: value,
                                value: metricValue,
                                trialJobId: job.trialJobId
                            };
                            exportedData.push(oneEntry);
                        }
                    });
                }
            }
        }
        return JSON.stringify(exportedData);
    }
    async getImportedData() {
        const importedData = [];
        const importDataEvents = await this.db.queryTrialJobEvent(undefined, 'IMPORT_DATA');
        for (const event of importDataEvents) {
            if (event.data) {
                importedData.push(event.data);
            }
        }
        return importedData;
    }
    async queryTrialJobs(status, trialJobId) {
        const result = [];
        const trialJobEvents = await this.db.queryTrialJobEvent(trialJobId);
        if (trialJobEvents === undefined) {
            return result;
        }
        const map = this.getTrialJobsByReplayEvents(trialJobEvents);
        const finalMetricsMap = await this.getFinalMetricData(trialJobId);
        for (const key of map.keys()) {
            const jobInfo = map.get(key);
            if (jobInfo === undefined) {
                continue;
            }
            if (!(status !== undefined && jobInfo.status !== status)) {
                if (jobInfo.status === 'SUCCEEDED') {
                    jobInfo.finalMetricData = finalMetricsMap.get(jobInfo.trialJobId);
                }
                result.push(jobInfo);
            }
        }
        return result;
    }
    async getFinalMetricData(trialJobId) {
        const map = new Map();
        const metrics = await this.getMetricData(trialJobId, 'FINAL');
        const multiPhase = await this.isMultiPhase();
        for (const metric of metrics) {
            const existMetrics = map.get(metric.trialJobId);
            if (existMetrics !== undefined) {
                if (!multiPhase) {
                    this.log.error(`Found multiple FINAL results for trial job ${trialJobId}, metrics: ${JSON.stringify(metrics)}`);
                }
                else {
                    existMetrics.push(metric);
                }
            }
            else {
                map.set(metric.trialJobId, [metric]);
            }
        }
        return map;
    }
    async isMultiPhase() {
        if (this.multiPhase === undefined) {
            const expProfile = await this.getExperimentProfile(experimentStartupInfo_1.getExperimentId());
            if (expProfile !== undefined) {
                this.multiPhase = expProfile.params.multiPhase;
            }
            else {
                return false;
            }
        }
        if (this.multiPhase !== undefined) {
            return this.multiPhase;
        }
        else {
            return false;
        }
    }
    getJobStatusByLatestEvent(oldStatus, event) {
        switch (event) {
            case 'USER_TO_CANCEL':
                return 'USER_CANCELED';
            case 'ADD_CUSTOMIZED':
                return 'WAITING';
            case 'ADD_HYPERPARAMETER':
                return oldStatus;
            default:
        }
        return event;
    }
    parseHyperParameter(hParamStr) {
        let hParam;
        try {
            hParam = JSON.parse(hParamStr);
            return hParam;
        }
        catch (err) {
            this.log.error(`Hyper parameter needs to be in json format: ${hParamStr}`);
            return undefined;
        }
    }
    getTrialJobsByReplayEvents(trialJobEvents) {
        this.log.debug('getTrialJobsByReplayEvents begin');
        const map = new Map();
        const hParamIdMap = new Map();
        for (const record of trialJobEvents) {
            let jobInfo;
            if (record.trialJobId === undefined || record.trialJobId.length < 1) {
                continue;
            }
            if (map.has(record.trialJobId)) {
                jobInfo = map.get(record.trialJobId);
            }
            else {
                jobInfo = {
                    trialJobId: record.trialJobId,
                    status: this.getJobStatusByLatestEvent('UNKNOWN', record.event),
                    hyperParameters: []
                };
            }
            if (!jobInfo) {
                throw new Error('Empty JobInfo');
            }
            switch (record.event) {
                case 'RUNNING':
                    if (record.timestamp !== undefined) {
                        jobInfo.startTime = record.timestamp;
                    }
                case 'WAITING':
                    if (record.logPath !== undefined) {
                        jobInfo.logPath = record.logPath;
                    }
                    if (jobInfo.startTime === undefined && record.timestamp !== undefined) {
                        jobInfo.startTime = record.timestamp;
                    }
                    break;
                case 'SUCCEEDED':
                case 'FAILED':
                case 'USER_CANCELED':
                case 'SYS_CANCELED':
                case 'EARLY_STOPPED':
                    if (record.logPath !== undefined) {
                        jobInfo.logPath = record.logPath;
                    }
                    jobInfo.endTime = record.timestamp;
                    if (jobInfo.startTime === undefined && record.timestamp !== undefined) {
                        jobInfo.startTime = record.timestamp;
                    }
                default:
            }
            jobInfo.status = this.getJobStatusByLatestEvent(jobInfo.status, record.event);
            if (record.data !== undefined && record.data.trim().length > 0) {
                const newHParam = this.parseHyperParameter(record.data);
                if (newHParam !== undefined) {
                    if (jobInfo.hyperParameters !== undefined) {
                        let hParamIds = hParamIdMap.get(jobInfo.trialJobId);
                        if (hParamIds === undefined) {
                            hParamIds = new Set();
                        }
                        if (!hParamIds.has(newHParam.parameter_index)) {
                            jobInfo.hyperParameters.push(JSON.stringify(newHParam));
                            hParamIds.add(newHParam.parameter_index);
                            hParamIdMap.set(jobInfo.trialJobId, hParamIds);
                        }
                    }
                    else {
                        assert(false, 'jobInfo.hyperParameters is undefined');
                    }
                }
            }
            if (record.sequenceId !== undefined && jobInfo.sequenceId === undefined) {
                jobInfo.sequenceId = record.sequenceId;
            }
            map.set(record.trialJobId, jobInfo);
        }
        this.log.debug('getTrialJobsByReplayEvents done');
        return map;
    }
}
exports.NNIDataStore = NNIDataStore;
