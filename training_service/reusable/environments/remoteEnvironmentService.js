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
const environment_1 = require("../environment");
const utils_1 = require("../../../common/utils");
const trialConfigMetadataKey_1 = require("../../common/trialConfigMetadataKey");
const util_1 = require("../../common/util");
const remoteMachineData_1 = require("../../remote_machine/remoteMachineData");
let RemoteEnvironmentService = class RemoteEnvironmentService extends environment_1.EnvironmentService {
    constructor() {
        super();
        this.initExecutorId = "initConnection";
        this.experimentId = experimentStartupInfo_1.getExperimentId();
        this.environmentExecutorManagerMap = new Map();
        this.machineExecutorManagerMap = new Map();
        this.remoteMachineMetaOccupiedMap = new Map();
        this.sshConnectionPromises = [];
        this.experimentRootDir = utils_1.getExperimentRootDir();
        this.experimentId = experimentStartupInfo_1.getExperimentId();
        this.log = log_1.getLogger();
    }
    get prefetchedEnvironmentCount() {
        return this.machineExecutorManagerMap.size;
    }
    get environmentMaintenceLoopInterval() {
        return 5000;
    }
    get hasMoreEnvironments() {
        return false;
    }
    get hasStorageService() {
        return false;
    }
    async config(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.MACHINE_LIST:
                await this.setupConnections(value);
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.TRIAL_CONFIG: {
                const remoteMachineTrailConfig = JSON.parse(value);
                if (remoteMachineTrailConfig === undefined) {
                    throw new Error('trial config parsed failed');
                }
                if (!fs.lstatSync(remoteMachineTrailConfig.codeDir)
                    .isDirectory()) {
                    throw new Error(`codeDir ${remoteMachineTrailConfig.codeDir} is not a directory`);
                }
                try {
                    await util_1.validateCodeDir(remoteMachineTrailConfig.codeDir);
                }
                catch (error) {
                    this.log.error(error);
                    return Promise.reject(new Error(error));
                }
                this.trialConfig = remoteMachineTrailConfig;
                break;
            }
            default:
                this.log.debug(`Remote not support metadata key: '${key}', value: '${value}'`);
        }
    }
    scheduleMachine() {
        for (const [rmMeta, occupied] of this.remoteMachineMetaOccupiedMap) {
            if (!occupied) {
                this.remoteMachineMetaOccupiedMap.set(rmMeta, true);
                return rmMeta;
            }
        }
        return undefined;
    }
    async setupConnections(machineList) {
        this.log.debug(`Connecting to remote machines: ${machineList}`);
        const rmMetaList = JSON.parse(machineList);
        for (const rmMeta of rmMetaList) {
            this.sshConnectionPromises.push(await this.initRemoteMachineOnConnected(rmMeta));
        }
    }
    async initRemoteMachineOnConnected(rmMeta) {
        const executorManager = new remoteMachineData_1.ExecutorManager(rmMeta);
        this.log.info(`connecting to ${rmMeta.username}@${rmMeta.ip}:${rmMeta.port}`);
        const executor = await executorManager.getExecutor(this.initExecutorId);
        this.log.debug(`reached ${executor.name}`);
        this.machineExecutorManagerMap.set(rmMeta, executorManager);
        this.log.debug(`initializing ${executor.name}`);
        const nniRootDir = executor.joinPath(executor.getTempPath(), 'nni');
        await executor.createFolder(executor.getRemoteExperimentRootDir(experimentStartupInfo_1.getExperimentId()));
        const remoteGpuScriptCollectorDir = executor.getRemoteScriptsPath(experimentStartupInfo_1.getExperimentId());
        await executor.createFolder(remoteGpuScriptCollectorDir, true);
        await executor.allowPermission(true, nniRootDir);
    }
    async refreshEnvironment(environment) {
        const executor = await this.getExecutor(environment.id);
        const jobpidPath = `${environment.runnerWorkingFolder}/pid`;
        const runnerReturnCodeFilePath = `${environment.runnerWorkingFolder}/code`;
        try {
            const pidExist = await executor.fileExist(jobpidPath);
            if (!pidExist) {
                return;
            }
            const isAlive = await executor.isProcessAlive(jobpidPath);
            environment.status = 'RUNNING';
            if (!isAlive) {
                const remoteEnvironment = environment;
                if (remoteEnvironment.rmMachineMeta === undefined) {
                    throw new Error(`${remoteEnvironment.id} machine meta not initialized!`);
                }
                this.log.info(`pid in ${remoteEnvironment.rmMachineMeta.ip}:${jobpidPath} is not alive!`);
                if (fs.existsSync(runnerReturnCodeFilePath)) {
                    const runnerReturnCode = await executor.getRemoteFileContent(runnerReturnCodeFilePath);
                    const match = runnerReturnCode.trim()
                        .match(/^-?(\d+)\s+(\d+)$/);
                    if (match !== null) {
                        const { 1: code } = match;
                        if (parseInt(code, 10) === 0) {
                            environment.setStatus('SUCCEEDED');
                        }
                        else {
                            environment.setStatus('FAILED');
                        }
                        this.releaseEnvironmentResource(environment);
                    }
                }
            }
        }
        catch (error) {
            this.log.error(`Update job status exception, error is ${error.message}`);
        }
    }
    async refreshEnvironmentsStatus(environments) {
        const tasks = [];
        environments.forEach(async (environment) => {
            tasks.push(this.refreshEnvironment(environment));
        });
        await Promise.all(tasks);
    }
    releaseEnvironmentResource(environment) {
        const executorManager = this.environmentExecutorManagerMap.get(environment.id);
        if (executorManager === undefined) {
            throw new Error(`ExecutorManager is not assigned for environment ${environment.id}`);
        }
        executorManager.releaseExecutor(environment.id);
        const remoteEnvironment = environment;
        if (remoteEnvironment.rmMachineMeta === undefined) {
            throw new Error(`${remoteEnvironment.id} rmMachineMeta not initialized!`);
        }
        this.remoteMachineMetaOccupiedMap.set(remoteEnvironment.rmMachineMeta, false);
    }
    async startEnvironment(environment) {
        if (this.sshConnectionPromises.length > 0) {
            await Promise.all(this.sshConnectionPromises);
            this.log.info('ssh connection initialized!');
            this.sshConnectionPromises = [];
            if (this.trialConfig === undefined) {
                throw new Error("trial config not initialized!");
            }
            Array.from(this.machineExecutorManagerMap.keys()).forEach(rmMeta => {
                this.remoteMachineMetaOccupiedMap.set(rmMeta, false);
            });
        }
        const remoteEnvironment = environment;
        remoteEnvironment.status = 'WAITING';
        await this.prepareEnvironment(remoteEnvironment);
        await this.launchRunner(environment);
    }
    async prepareEnvironment(environment) {
        if (this.trialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        const rmMachineMeta = this.scheduleMachine();
        if (rmMachineMeta === undefined) {
            this.log.warning(`No available machine!`);
            return Promise.resolve(false);
        }
        else {
            environment.rmMachineMeta = rmMachineMeta;
            const executorManager = this.machineExecutorManagerMap.get(environment.rmMachineMeta);
            if (executorManager === undefined) {
                throw new Error(`executorManager not initialized`);
            }
            this.environmentExecutorManagerMap.set(environment.id, executorManager);
            const executor = await this.getExecutor(environment.id);
            environment.runnerWorkingFolder =
                executor.joinPath(executor.getRemoteExperimentRootDir(experimentStartupInfo_1.getExperimentId()), 'envs', environment.id);
            environment.command = `cd ${environment.runnerWorkingFolder} && \
${environment.command} --job_pid_file ${environment.runnerWorkingFolder}/pid \
1>${environment.runnerWorkingFolder}/trialrunner_stdout 2>${environment.runnerWorkingFolder}/trialrunner_stderr \
&& echo $? \`date +%s%3N\` >${environment.runnerWorkingFolder}/code`;
            return Promise.resolve(true);
        }
    }
    async launchRunner(environment) {
        if (this.trialConfig === undefined) {
            throw new Error('trial config is not initialized');
        }
        const executor = await this.getExecutor(environment.id);
        const environmentLocalTempFolder = path.join(this.experimentRootDir, this.experimentId, "environment-temp");
        await executor.createFolder(environment.runnerWorkingFolder);
        await util_1.execMkdir(environmentLocalTempFolder);
        await fs.promises.writeFile(path.join(environmentLocalTempFolder, executor.getScriptName("run")), environment.command, { encoding: 'utf8' });
        await executor.copyDirectoryToRemote(environmentLocalTempFolder, environment.runnerWorkingFolder);
        executor.executeScript(executor.joinPath(environment.runnerWorkingFolder, executor.getScriptName("run")), true, false);
        if (environment.rmMachineMeta === undefined) {
            throw new Error(`${environment.id} rmMachineMeta not initialized!`);
        }
        environment.trackingUrl = `file://${environment.rmMachineMeta.ip}:${environment.runnerWorkingFolder}`;
    }
    async getExecutor(environmentId) {
        const executorManager = this.environmentExecutorManagerMap.get(environmentId);
        if (executorManager === undefined) {
            throw new Error(`ExecutorManager is not assigned for environment ${environmentId}`);
        }
        return await executorManager.getExecutor(environmentId);
    }
    async stopEnvironment(environment) {
        const executor = await this.getExecutor(environment.id);
        if (environment.status === 'UNKNOWN') {
            environment.status = 'USER_CANCELED';
            this.releaseEnvironmentResource(environment);
            return;
        }
        const jobpidPath = `${environment.runnerWorkingFolder}/pid`;
        try {
            await executor.killChildProcesses(jobpidPath);
            this.releaseEnvironmentResource(environment);
        }
        catch (error) {
            this.log.error(`stopEnvironment: ${error}`);
        }
    }
};
RemoteEnvironmentService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], RemoteEnvironmentService);
exports.RemoteEnvironmentService = RemoteEnvironmentService;
