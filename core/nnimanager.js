'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const ts_deferred_1 = require("ts-deferred");
const component = require("../common/component");
const datastore_1 = require("../common/datastore");
const errors_1 = require("../common/errors");
const experimentStartupInfo_1 = require("../common/experimentStartupInfo");
const log_1 = require("../common/log");
const experimentManager_1 = require("../common/experimentManager");
const trainingService_1 = require("../common/trainingService");
const utils_1 = require("../common/utils");
const commands_1 = require("./commands");
const ipcInterface_1 = require("./ipcInterface");
class NNIManager {
    constructor() {
        this.currSubmittedTrialNum = 0;
        this.trialConcurrencyChange = 0;
        this.trainingService = component.get(trainingService_1.TrainingService);
        this.experimentManager = component.get(experimentManager_1.ExperimentManager);
        assert(this.trainingService);
        this.dispatcherPid = 0;
        this.waitingTrials = [];
        this.trialJobs = new Map();
        this.trialDataForTuner = '';
        this.readonly = false;
        this.log = log_1.getLogger();
        this.dataStore = component.get(datastore_1.DataStore);
        this.experimentProfile = this.createEmptyExperimentProfile();
        this.status = {
            status: 'INITIALIZED',
            errors: []
        };
        this.trialJobMetricListener = (metric) => {
            this.onTrialJobMetrics(metric).catch((err) => {
                this.criticalError(errors_1.NNIError.FromError(err, 'Job metrics error: '));
            });
        };
        const pipe = experimentStartupInfo_1.getDispatcherPipe();
        if (pipe !== null) {
            this.dispatcher = ipcInterface_1.createDispatcherPipeInterface(pipe);
        }
    }
    updateExperimentProfile(experimentProfile, updateType) {
        if (this.readonly) {
            return Promise.reject(new Error('Error: can not update experiment profile in readonly mode!'));
        }
        switch (updateType) {
            case 'TRIAL_CONCURRENCY':
                this.updateTrialConcurrency(experimentProfile.params.trialConcurrency);
                break;
            case 'MAX_EXEC_DURATION':
                this.updateMaxExecDuration(experimentProfile.params.maxExecDuration);
                break;
            case 'SEARCH_SPACE':
                this.updateSearchSpace(experimentProfile.params.searchSpace);
                break;
            case 'MAX_TRIAL_NUM':
                this.updateMaxTrialNum(experimentProfile.params.maxTrialNum);
                break;
            default:
                throw new Error('Error: unrecognized updateType');
        }
        return this.storeExperimentProfile();
    }
    importData(data) {
        if (this.readonly) {
            return Promise.reject(new Error('Error: can not import data in readonly mode!'));
        }
        if (this.dispatcher === undefined) {
            return Promise.reject(new Error('tuner has not been setup'));
        }
        this.dispatcher.sendCommand(commands_1.IMPORT_DATA, data);
        return this.dataStore.storeTrialJobEvent('IMPORT_DATA', '', data);
    }
    getImportedData() {
        return this.dataStore.getImportedData();
    }
    async exportData() {
        return this.dataStore.exportTrialHpConfigs();
    }
    addCustomizedTrialJob(hyperParams) {
        if (this.readonly) {
            return Promise.reject(new Error('Error: can not add customized trial job in readonly mode!'));
        }
        if (this.currSubmittedTrialNum >= this.experimentProfile.params.maxTrialNum) {
            return Promise.reject(new Error('reach maxTrialNum'));
        }
        const packedParameter = {
            parameter_id: null,
            parameter_source: 'customized',
            parameters: JSON.parse(hyperParams)
        };
        const form = {
            sequenceId: this.experimentProfile.nextSequenceId++,
            hyperParameters: {
                value: JSON.stringify(packedParameter),
                index: 0
            }
        };
        this.waitingTrials.push(form);
        this.dataStore.storeTrialJobEvent('ADD_CUSTOMIZED', '', hyperParams);
        return Promise.resolve(form.sequenceId);
    }
    async cancelTrialJobByUser(trialJobId) {
        if (this.readonly) {
            return Promise.reject(new Error('Error: can not cancel trial job in readonly mode!'));
        }
        this.log.info(`User cancelTrialJob: ${trialJobId}`);
        await this.trainingService.cancelTrialJob(trialJobId);
        await this.dataStore.storeTrialJobEvent('USER_TO_CANCEL', trialJobId, '');
    }
    async startExperiment(expParams) {
        this.log.info(`Starting experiment: ${this.experimentProfile.id}`);
        this.experimentProfile.params = expParams;
        await this.storeExperimentProfile();
        this.log.debug('Setup tuner...');
        if (expParams.multiPhase && this.trainingService.isMultiPhaseJobSupported) {
            this.trainingService.setClusterMetadata('multiPhase', expParams.multiPhase.toString());
        }
        if (expParams.versionCheck !== undefined) {
            this.trainingService.setClusterMetadata('version_check', expParams.versionCheck.toString());
        }
        if (expParams.logCollection !== undefined) {
            this.trainingService.setClusterMetadata('log_collection', expParams.logCollection.toString());
        }
        const dispatcherCommand = utils_1.getMsgDispatcherCommand(expParams);
        this.log.debug(`dispatcher command: ${dispatcherCommand}`);
        const checkpointDir = await this.createCheckpointDir();
        this.setupTuner(dispatcherCommand, undefined, 'start', checkpointDir);
        this.experimentProfile.startTime = Date.now();
        this.setStatus('RUNNING');
        await this.storeExperimentProfile();
        this.run().catch((err) => {
            this.criticalError(err);
        });
        return this.experimentProfile.id;
    }
    async resumeExperiment(readonly) {
        this.log.info(`Resuming experiment: ${this.experimentProfile.id}`);
        const experimentId = experimentStartupInfo_1.getExperimentId();
        this.experimentProfile = await this.dataStore.getExperimentProfile(experimentId);
        this.readonly = readonly;
        if (readonly) {
            return Promise.resolve();
        }
        const expParams = this.experimentProfile.params;
        if (expParams.multiPhase && this.trainingService.isMultiPhaseJobSupported) {
            this.trainingService.setClusterMetadata('multiPhase', expParams.multiPhase.toString());
        }
        if (expParams.versionCheck !== undefined) {
            this.trainingService.setClusterMetadata('version_check', expParams.versionCheck.toString());
        }
        const dispatcherCommand = utils_1.getMsgDispatcherCommand(expParams);
        this.log.debug(`dispatcher command: ${dispatcherCommand}`);
        const checkpointDir = await this.createCheckpointDir();
        this.setupTuner(dispatcherCommand, undefined, 'resume', checkpointDir);
        const allTrialJobs = await this.dataStore.listTrialJobs();
        this.currSubmittedTrialNum = allTrialJobs.length;
        await Promise.all(allTrialJobs
            .filter((job) => job.status === 'WAITING' || job.status === 'RUNNING')
            .map((job) => this.dataStore.storeTrialJobEvent('FAILED', job.trialJobId)));
        const finishedTrialData = await this.exportData();
        const importedData = await this.dataStore.getImportedData();
        let trialData = JSON.parse(finishedTrialData);
        for (const oneImportedData of importedData) {
            trialData = trialData.concat(JSON.parse(oneImportedData));
        }
        this.trialDataForTuner = JSON.stringify(trialData);
        if (this.experimentProfile.execDuration < this.experimentProfile.params.maxExecDuration &&
            this.currSubmittedTrialNum < this.experimentProfile.params.maxTrialNum &&
            this.experimentProfile.endTime) {
            delete this.experimentProfile.endTime;
        }
        this.setStatus('RUNNING');
        this.run().catch((err) => {
            this.criticalError(err);
        });
    }
    getTrialJob(trialJobId) {
        return this.dataStore.getTrialJob(trialJobId);
    }
    async setClusterMetadata(key, value) {
        if (this.readonly) {
            return Promise.reject(new Error('Error: can not set cluster metadata in readonly mode!'));
        }
        this.log.info(`NNIManager setClusterMetadata, key: ${key}, value: ${value}`);
        let timeoutId;
        const delay1 = new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => { reject(new Error('TrainingService setClusterMetadata timeout. Please check your config file.')); }, 30000);
        });
        await Promise.race([delay1, this.trainingService.setClusterMetadata(key, value)]).finally(() => {
            clearTimeout(timeoutId);
        });
    }
    getClusterMetadata(key) {
        return Promise.resolve(this.trainingService.getClusterMetadata(key));
    }
    async getTrialJobStatistics() {
        return this.dataStore.getTrialJobStatistics();
    }
    async stopExperiment() {
        this.setStatus('STOPPING');
        this.log.info('Stopping experiment, cleaning up ...');
        await this.experimentDoneCleanUp();
        this.log.info('Experiment stopped.');
    }
    async getMetricData(trialJobId, metricType) {
        return this.dataStore.getMetricData(trialJobId, metricType);
    }
    async getMetricDataByRange(minSeqId, maxSeqId) {
        const trialJobs = await this.dataStore.listTrialJobs();
        const targetTrials = trialJobs.filter(trial => (trial.sequenceId !== undefined && minSeqId <= trial.sequenceId && trial.sequenceId <= maxSeqId));
        const targetTrialIds = new Set(targetTrials.map(trial => trial.trialJobId));
        const allMetrics = await this.dataStore.getMetricData();
        return allMetrics.filter(metric => targetTrialIds.has(metric.trialJobId));
    }
    async getLatestMetricData() {
        const allMetrics = await this.dataStore.getMetricData();
        const finals = [];
        const latestIntermediates = new Map();
        for (const metric of allMetrics) {
            if (metric.type !== 'PERIODICAL') {
                finals.push(metric);
            }
            else {
                const old = latestIntermediates.get(metric.trialJobId);
                if (old === undefined || old.sequence <= metric.sequence) {
                    latestIntermediates.set(metric.trialJobId, metric);
                }
            }
        }
        return finals.concat(Array.from(latestIntermediates.values()));
    }
    async getTrialLog(trialJobId, logType) {
        return this.trainingService.getTrialLog(trialJobId, logType);
    }
    getExperimentProfile() {
        const deferred = new ts_deferred_1.Deferred();
        deferred.resolve(this.experimentProfile);
        return deferred.promise;
    }
    getStatus() {
        return this.status;
    }
    getTrialJobMessage(trialJobId) {
        const trialJob = this.trialJobs.get(trialJobId);
        if (trialJob !== undefined) {
            return trialJob.message;
        }
        return undefined;
    }
    async listTrialJobs(status) {
        return this.dataStore.listTrialJobs(status);
    }
    setupTuner(command, cwd, mode, dataDirectory) {
        if (this.dispatcher !== undefined) {
            return;
        }
        const stdio = ['ignore', process.stdout, process.stderr, 'pipe', 'pipe'];
        let newCwd;
        if (cwd === undefined || cwd === '') {
            newCwd = utils_1.getLogDir();
        }
        else {
            newCwd = cwd;
        }
        let includeIntermediateResultsEnv = false;
        if (this.experimentProfile.params.tuner !== undefined) {
            includeIntermediateResultsEnv = this.experimentProfile.params.tuner.includeIntermediateResults;
        }
        const nniEnv = {
            SDK_PROCESS: 'dispatcher',
            NNI_MODE: mode,
            NNI_CHECKPOINT_DIRECTORY: dataDirectory,
            NNI_LOG_DIRECTORY: utils_1.getLogDir(),
            NNI_LOG_LEVEL: utils_1.getLogLevel(),
            NNI_INCLUDE_INTERMEDIATE_RESULTS: includeIntermediateResultsEnv,
            CUDA_VISIBLE_DEVICES: this.getGpuEnvvarValue()
        };
        const newEnv = Object.assign({}, process.env, nniEnv);
        const tunerProc = utils_1.getTunerProc(command, stdio, newCwd, newEnv);
        this.dispatcherPid = tunerProc.pid;
        this.dispatcher = ipcInterface_1.createDispatcherInterface(tunerProc);
        return;
    }
    getGpuEnvvarValue() {
        let cudaDevices;
        if (this.experimentProfile.params.advisor !== undefined) {
            cudaDevices = this.experimentProfile.params.advisor.gpuIndices;
        }
        else if (this.experimentProfile.params.tuner !== undefined) {
            cudaDevices = this.experimentProfile.params.tuner.gpuIndices;
        }
        if (cudaDevices === undefined) {
            return '';
        }
        else {
            return cudaDevices;
        }
    }
    updateTrialConcurrency(trialConcurrency) {
        this.trialConcurrencyChange += (trialConcurrency - this.experimentProfile.params.trialConcurrency);
        this.experimentProfile.params.trialConcurrency = trialConcurrency;
        return;
    }
    updateMaxExecDuration(duration) {
        this.experimentProfile.params.maxExecDuration = duration;
        return;
    }
    updateSearchSpace(searchSpace) {
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner has not been setup');
        }
        this.dispatcher.sendCommand(commands_1.UPDATE_SEARCH_SPACE, searchSpace);
        this.experimentProfile.params.searchSpace = searchSpace;
        return;
    }
    updateMaxTrialNum(maxTrialNum) {
        this.experimentProfile.params.maxTrialNum = maxTrialNum;
        return;
    }
    async experimentDoneCleanUp() {
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner has not been setup');
        }
        this.trainingService.removeTrialJobMetricListener(this.trialJobMetricListener);
        this.dispatcher.sendCommand(commands_1.TERMINATE);
        let tunerAlive = true;
        for (let i = 0; i < 30; i++) {
            if (!tunerAlive) {
                break;
            }
            tunerAlive = await utils_1.isAlive(this.dispatcherPid);
            await utils_1.delay(1000);
        }
        await utils_1.killPid(this.dispatcherPid);
        const trialJobList = await this.trainingService.listTrialJobs();
        for (const trialJob of trialJobList) {
            if (trialJob.status === 'RUNNING' ||
                trialJob.status === 'WAITING') {
                try {
                    this.log.info(`cancelTrialJob: ${trialJob.id}`);
                    await this.trainingService.cancelTrialJob(trialJob.id);
                }
                catch (error) {
                    this.log.debug(`ignorable error on canceling trial ${trialJob.id}. ${error}`);
                }
            }
        }
        await this.trainingService.cleanUp();
        if (this.experimentProfile.endTime === undefined) {
            this.setEndtime();
        }
        await this.storeExperimentProfile();
        this.setStatus('STOPPED');
    }
    async periodicallyUpdateExecDuration() {
        let count = 1;
        while (!['ERROR', 'STOPPING', 'STOPPED'].includes(this.status.status)) {
            await utils_1.delay(1000 * 1);
            if (['RUNNING', 'NO_MORE_TRIAL', 'TUNER_NO_MORE_TRIAL'].includes(this.status.status)) {
                this.experimentProfile.execDuration += 1;
                if (count % 10 === 0) {
                    await this.storeExperimentProfile();
                }
            }
            count += 1;
        }
    }
    async pingDispatcher() {
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner has not been setup');
        }
        while (!['ERROR', 'STOPPING', 'STOPPED'].includes(this.status.status)) {
            this.dispatcher.sendCommand(commands_1.PING);
            await utils_1.delay(1000 * 5);
        }
    }
    async requestTrialJobsStatus() {
        let finishedTrialJobNum = 0;
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner has not been setup');
        }
        for (const trialJobId of Array.from(this.trialJobs.keys())) {
            const trialJobDetail = await this.trainingService.getTrialJob(trialJobId);
            const oldTrialJobDetail = this.trialJobs.get(trialJobId);
            if (oldTrialJobDetail !== undefined && oldTrialJobDetail.status !== trialJobDetail.status) {
                this.log.info(`Trial job ${trialJobDetail.id} status changed from ${oldTrialJobDetail.status} to ${trialJobDetail.status}`);
                this.trialJobs.set(trialJobId, Object.assign({}, trialJobDetail));
                await this.dataStore.storeTrialJobEvent(trialJobDetail.status, trialJobDetail.id, undefined, trialJobDetail);
            }
            const newTrialJobDetail = this.trialJobs.get(trialJobId);
            if (newTrialJobDetail !== undefined) {
                newTrialJobDetail.message = trialJobDetail.message;
            }
            let hyperParams = undefined;
            switch (trialJobDetail.status) {
                case 'SUCCEEDED':
                case 'USER_CANCELED':
                case 'EARLY_STOPPED':
                    this.trialJobs.delete(trialJobId);
                    finishedTrialJobNum++;
                    hyperParams = trialJobDetail.form.hyperParameters.value;
                    this.dispatcher.sendCommand(commands_1.TRIAL_END, JSON.stringify({
                        trial_job_id: trialJobDetail.id,
                        event: trialJobDetail.status,
                        hyper_params: hyperParams
                    }));
                    break;
                case 'FAILED':
                case 'SYS_CANCELED':
                    this.trialJobs.delete(trialJobId);
                    finishedTrialJobNum++;
                    hyperParams = trialJobDetail.form.hyperParameters.value;
                    this.dispatcher.sendCommand(commands_1.TRIAL_END, JSON.stringify({
                        trial_job_id: trialJobDetail.id,
                        event: trialJobDetail.status,
                        hyper_params: hyperParams
                    }));
                    break;
                case 'WAITING':
                case 'RUNNING':
                case 'UNKNOWN':
                    break;
                default:
            }
        }
        return finishedTrialJobNum;
    }
    async manageTrials() {
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner has not been setup');
        }
        let allFinishedTrialJobNum = this.currSubmittedTrialNum;
        let waitSubmittedToFinish;
        while (!['ERROR', 'STOPPING', 'STOPPED'].includes(this.status.status)) {
            const finishedTrialJobNum = await this.requestTrialJobsStatus();
            allFinishedTrialJobNum += finishedTrialJobNum;
            const requestTrialNum = this.trialConcurrencyChange + finishedTrialJobNum;
            if (requestTrialNum >= 0) {
                this.trialConcurrencyChange = 0;
            }
            else {
                this.trialConcurrencyChange = requestTrialNum;
            }
            this.requestTrialJobs(requestTrialNum);
            assert(this.status.status === 'RUNNING' ||
                this.status.status === 'DONE' ||
                this.status.status === 'NO_MORE_TRIAL' ||
                this.status.status === 'TUNER_NO_MORE_TRIAL', `Actual status: ${this.status.status}`);
            if (this.experimentProfile.execDuration > this.experimentProfile.params.maxExecDuration ||
                this.currSubmittedTrialNum >= this.experimentProfile.params.maxTrialNum) {
                if (this.status.status !== 'DONE') {
                    this.setStatus('NO_MORE_TRIAL');
                    waitSubmittedToFinish = this.currSubmittedTrialNum;
                    assert(allFinishedTrialJobNum <= waitSubmittedToFinish);
                    if (allFinishedTrialJobNum >= waitSubmittedToFinish) {
                        this.setStatus('DONE');
                        this.setEndtime();
                        await this.storeExperimentProfile();
                        this.log.info('Experiment done.');
                    }
                }
            }
            else {
                if (this.status.status === 'DONE') {
                    delete this.experimentProfile.endTime;
                    await this.storeExperimentProfile();
                }
                if (this.status.status !== 'TUNER_NO_MORE_TRIAL') {
                    this.setStatus('RUNNING');
                }
                for (let i = this.trialJobs.size; i < this.experimentProfile.params.trialConcurrency; i++) {
                    if (this.waitingTrials.length === 0 ||
                        this.currSubmittedTrialNum >= this.experimentProfile.params.maxTrialNum) {
                        break;
                    }
                    const form = this.waitingTrials.shift();
                    this.currSubmittedTrialNum++;
                    this.log.info(`submitTrialJob: form: ${JSON.stringify(form)}`);
                    const trialJobDetail = await this.trainingService.submitTrialJob(form);
                    await this.storeExperimentProfile();
                    this.trialJobs.set(trialJobDetail.id, Object.assign({}, trialJobDetail));
                    const trialJobDetailSnapshot = this.trialJobs.get(trialJobDetail.id);
                    if (trialJobDetailSnapshot != undefined) {
                        await this.dataStore.storeTrialJobEvent(trialJobDetailSnapshot.status, trialJobDetailSnapshot.id, form.hyperParameters.value, trialJobDetailSnapshot);
                    }
                    else {
                        assert(false, `undefined trialJobDetail in trialJobs: ${trialJobDetail.id}`);
                    }
                }
            }
            await utils_1.delay(1000 * 5);
        }
    }
    storeExperimentProfile() {
        this.experimentProfile.revision += 1;
        return this.dataStore.storeExperimentProfile(this.experimentProfile);
    }
    async run() {
        assert(this.dispatcher !== undefined);
        this.addEventListeners();
        this.sendInitTunerCommands();
        await Promise.all([
            this.periodicallyUpdateExecDuration(),
            this.pingDispatcher().catch((err) => {
                throw errors_1.NNIError.FromError(err, 'Dispatcher error: ');
            }),
            this.trainingService.run().catch((err) => {
                throw errors_1.NNIError.FromError(err, 'Training service error: ');
            }),
            this.manageTrials().catch((err) => {
                throw errors_1.NNIError.FromError(err, 'Job management error: ');
            })
        ]);
    }
    addEventListeners() {
        this.log.info('Add event listeners');
        if (this.dispatcher === undefined) {
            throw new Error('Error: tuner or job maintainer have not been setup');
        }
        this.trainingService.addTrialJobMetricListener(this.trialJobMetricListener);
        this.dispatcher.onCommand((commandType, content) => {
            this.onTunerCommand(commandType, content).catch((err) => {
                this.criticalError(errors_1.NNIError.FromError(err, 'Tuner command event error: '));
            });
        });
        this.dispatcher.onError((error) => {
            this.log.error(`Dispatcher error: ${error.message}`);
            this.criticalError(new Error('Dispatcher stream error, tuner may have crashed.'));
        });
    }
    sendInitTunerCommands() {
        if (this.dispatcher === undefined) {
            throw new Error('Dispatcher error: tuner has not been setup');
        }
        this.log.debug(`Send tuner command: INITIALIZE: ${this.experimentProfile.params.searchSpace}`);
        this.dispatcher.sendCommand(commands_1.INITIALIZE, this.experimentProfile.params.searchSpace);
    }
    async onTrialJobMetrics(metric) {
        this.log.debug(`NNIManager received trial job metrics: ${JSON.stringify(metric)}`);
        if (this.trialJobs.has(metric.id)) {
            await this.dataStore.storeMetricData(metric.id, metric.data);
            if (this.dispatcher === undefined) {
                throw new Error('Error: tuner has not been setup');
            }
            this.dispatcher.sendCommand(commands_1.REPORT_METRIC_DATA, metric.data);
        }
        else {
            this.log.warning(`NNIManager received non-existent trial job metrics: ${metric}`);
        }
    }
    requestTrialJobs(jobNum) {
        if (jobNum < 1) {
            return;
        }
        if (this.dispatcher === undefined) {
            throw new Error('Dispatcher error: tuner has not been setup');
        }
        if (this.experimentProfile.params.multiThread) {
            for (let i = 0; i < jobNum; i++) {
                this.dispatcher.sendCommand(commands_1.REQUEST_TRIAL_JOBS, '1');
            }
        }
        else {
            this.dispatcher.sendCommand(commands_1.REQUEST_TRIAL_JOBS, String(jobNum));
        }
    }
    async onTunerCommand(commandType, content) {
        this.log.info(`NNIManager received command from dispatcher: ${commandType}, ${content}`);
        switch (commandType) {
            case commands_1.INITIALIZED: {
                if (this.trialDataForTuner.length > 0) {
                    if (this.dispatcher === undefined) {
                        throw new Error('Dispatcher error: tuner has not been setup');
                    }
                    this.dispatcher.sendCommand(commands_1.IMPORT_DATA, this.trialDataForTuner);
                }
                this.requestTrialJobs(this.experimentProfile.params.trialConcurrency);
                break;
            }
            case commands_1.NEW_TRIAL_JOB: {
                if (this.status.status === 'TUNER_NO_MORE_TRIAL') {
                    this.log.warning('It is not supposed to receive more trials after NO_MORE_TRIAL is set');
                    this.setStatus('RUNNING');
                }
                const form = {
                    sequenceId: this.experimentProfile.nextSequenceId++,
                    hyperParameters: {
                        value: content,
                        index: 0
                    }
                };
                this.waitingTrials.push(form);
                break;
            }
            case commands_1.SEND_TRIAL_JOB_PARAMETER: {
                const tunerCommand = JSON.parse(content);
                assert(tunerCommand.parameter_index >= 0);
                assert(tunerCommand.trial_job_id !== undefined);
                const trialJobForm = {
                    sequenceId: -1,
                    hyperParameters: {
                        value: content,
                        index: tunerCommand.parameter_index
                    }
                };
                this.log.info(`updateTrialJob: job id: ${tunerCommand.trial_job_id}, form: ${JSON.stringify(trialJobForm)}`);
                await this.trainingService.updateTrialJob(tunerCommand.trial_job_id, trialJobForm);
                if (tunerCommand['parameters'] !== null) {
                    await this.dataStore.storeTrialJobEvent('ADD_HYPERPARAMETER', tunerCommand.trial_job_id, content, undefined);
                }
                break;
            }
            case commands_1.NO_MORE_TRIAL_JOBS: {
                if (!['ERROR', 'STOPPING', 'STOPPED'].includes(this.status.status)) {
                    this.setStatus('TUNER_NO_MORE_TRIAL');
                }
                break;
            }
            case commands_1.KILL_TRIAL_JOB: {
                this.log.info(`cancelTrialJob: ${JSON.parse(content)}`);
                await this.trainingService.cancelTrialJob(JSON.parse(content), true);
                break;
            }
            default:
                throw new Error('Error: unsupported command type from tuner');
        }
    }
    criticalError(err) {
        this.logError(err);
        console.error(err);
    }
    logError(err) {
        if (err.stack !== undefined) {
            this.log.error(err.stack);
        }
        this.status.errors.push(err.message);
        this.setEndtime();
        this.setStatus('ERROR');
    }
    setStatus(status) {
        if (status !== this.status.status) {
            this.log.info(`Change NNIManager status from: ${this.status.status} to: ${status}`);
            this.status.status = status;
            this.experimentManager.setExperimentInfo(this.experimentProfile.id, 'status', this.status.status);
        }
    }
    setEndtime() {
        this.experimentProfile.endTime = Date.now();
        this.experimentManager.setExperimentInfo(this.experimentProfile.id, 'endTime', this.experimentProfile.endTime);
    }
    createEmptyExperimentProfile() {
        return {
            id: experimentStartupInfo_1.getExperimentId(),
            revision: 0,
            execDuration: 0,
            logDir: utils_1.getExperimentRootDir(),
            nextSequenceId: 0,
            params: {
                authorName: '',
                experimentName: '',
                trialConcurrency: 0,
                maxExecDuration: 0,
                maxTrialNum: 0,
                trainingServicePlatform: '',
                searchSpace: ''
            }
        };
    }
    async createCheckpointDir() {
        const chkpDir = utils_1.getCheckpointDir();
        await utils_1.mkDirP(chkpDir);
        if (this.experimentProfile.params.advisor) {
            this.experimentProfile.params.advisor.checkpointDir = chkpDir;
        }
        if (this.experimentProfile.params.tuner) {
            this.experimentProfile.params.tuner.checkpointDir = chkpDir;
        }
        if (this.experimentProfile.params.assessor) {
            this.experimentProfile.params.assessor.checkpointDir = chkpDir;
        }
        return Promise.resolve(chkpDir);
    }
}
exports.NNIManager = NNIManager;
