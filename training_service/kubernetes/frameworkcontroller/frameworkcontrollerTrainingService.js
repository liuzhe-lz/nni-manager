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
const assert = require("assert");
const cpp = require("child-process-promise");
const fs = require("fs");
const path = require("path");
const component = require("../../../common/component");
const experimentStartupInfo_1 = require("../../../common/experimentStartupInfo");
const utils_1 = require("../../../common/utils");
const containerJobData_1 = require("../../common/containerJobData");
const trialConfigMetadataKey_1 = require("../../common/trialConfigMetadataKey");
const util_1 = require("../../common/util");
const kubernetesData_1 = require("../kubernetesData");
const kubernetesTrainingService_1 = require("../kubernetesTrainingService");
const frameworkcontrollerApiClient_1 = require("./frameworkcontrollerApiClient");
const frameworkcontrollerConfig_1 = require("./frameworkcontrollerConfig");
const frameworkcontrollerJobInfoCollector_1 = require("./frameworkcontrollerJobInfoCollector");
const frameworkcontrollerJobRestServer_1 = require("./frameworkcontrollerJobRestServer");
let FrameworkControllerTrainingService = class FrameworkControllerTrainingService extends kubernetesTrainingService_1.KubernetesTrainingService {
    constructor() {
        super();
        this.fcContainerPortMap = new Map();
        this.fcJobInfoCollector = new frameworkcontrollerJobInfoCollector_1.FrameworkControllerJobInfoCollector(this.trialJobsMap);
        this.experimentId = experimentStartupInfo_1.getExperimentId();
    }
    async run() {
        this.kubernetesJobRestServer = component.get(frameworkcontrollerJobRestServer_1.FrameworkControllerJobRestServer);
        if (this.kubernetesJobRestServer === undefined) {
            throw new Error('kubernetesJobRestServer not initialized!');
        }
        await this.kubernetesJobRestServer.start();
        this.kubernetesJobRestServer.setEnableVersionCheck = this.versionCheck;
        this.log.info(`frameworkcontroller Training service rest server listening on: ${this.kubernetesJobRestServer.endPoint}`);
        while (!this.stopping) {
            await utils_1.delay(3000);
            await this.fcJobInfoCollector.retrieveTrialStatus(this.kubernetesCRDClient);
            if (this.kubernetesJobRestServer.getErrorMessage !== undefined) {
                throw new Error(this.kubernetesJobRestServer.getErrorMessage);
                this.stopping = true;
            }
        }
    }
    async submitTrialJob(form) {
        if (this.fcClusterConfig === undefined) {
            throw new Error('frameworkcontrollerClusterConfig is not initialized');
        }
        if (this.kubernetesCRDClient === undefined) {
            throw new Error('kubernetesCRDClient is undefined');
        }
        if (this.kubernetesRestServerPort === undefined) {
            const restServer = component.get(frameworkcontrollerJobRestServer_1.FrameworkControllerJobRestServer);
            this.kubernetesRestServerPort = restServer.clusterRestServerPort;
        }
        if (this.copyExpCodeDirPromise !== undefined) {
            await this.copyExpCodeDirPromise;
        }
        const trialJobId = utils_1.uniqueString(5);
        const trialWorkingFolder = path.join(this.CONTAINER_MOUNT_PATH, 'nni', experimentStartupInfo_1.getExperimentId(), trialJobId);
        const trialLocalTempFolder = path.join(utils_1.getExperimentRootDir(), 'trials-local', trialJobId);
        const frameworkcontrollerJobName = `nniexp${this.experimentId}trial${trialJobId}`.toLowerCase();
        this.generateContainerPort();
        await this.prepareRunScript(trialLocalTempFolder, trialJobId, trialWorkingFolder, form);
        const trialJobOutputUrl = await this.uploadFolder(trialLocalTempFolder, `nni/${experimentStartupInfo_1.getExperimentId()}/${trialJobId}`);
        let initStatus = 'WAITING';
        if (!trialJobOutputUrl) {
            initStatus = 'FAILED';
        }
        const trialJobDetail = new kubernetesData_1.KubernetesTrialJobDetail(trialJobId, initStatus, Date.now(), trialWorkingFolder, form, frameworkcontrollerJobName, trialJobOutputUrl);
        this.trialJobsMap.set(trialJobId, trialJobDetail);
        const frameworkcontrollerJobConfig = await this.prepareFrameworkControllerConfig(trialJobId, trialWorkingFolder, frameworkcontrollerJobName);
        await this.kubernetesCRDClient.createKubernetesJob(frameworkcontrollerJobConfig);
        this.trialJobsMap.set(trialJobId, trialJobDetail);
        return Promise.resolve(trialJobDetail);
    }
    async setClusterMetadata(key, value) {
        switch (key) {
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.NNI_MANAGER_IP:
                this.nniManagerIpConfig = JSON.parse(value);
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.FRAMEWORKCONTROLLER_CLUSTER_CONFIG: {
                const frameworkcontrollerClusterJsonObject = JSON.parse(value);
                this.fcClusterConfig = frameworkcontrollerConfig_1.FrameworkControllerClusterConfigFactory
                    .generateFrameworkControllerClusterConfig(frameworkcontrollerClusterJsonObject);
                if (this.fcClusterConfig.storageType === 'azureStorage') {
                    const azureFrameworkControllerClusterConfig = this.fcClusterConfig;
                    this.azureStorageAccountName = azureFrameworkControllerClusterConfig.azureStorage.accountName;
                    this.azureStorageShare = azureFrameworkControllerClusterConfig.azureStorage.azureShare;
                    await this.createAzureStorage(azureFrameworkControllerClusterConfig.keyVault.vaultName, azureFrameworkControllerClusterConfig.keyVault.name);
                }
                else if (this.fcClusterConfig.storageType === 'nfs') {
                    const nfsFrameworkControllerClusterConfig = this.fcClusterConfig;
                    await this.createNFSStorage(nfsFrameworkControllerClusterConfig.nfs.server, nfsFrameworkControllerClusterConfig.nfs.path);
                }
                this.kubernetesCRDClient = frameworkcontrollerApiClient_1.FrameworkControllerClientFactory.createClient();
                break;
            }
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.TRIAL_CONFIG: {
                const frameworkcontrollerTrialJsonObjsect = JSON.parse(value);
                this.fcTrialConfig = new frameworkcontrollerConfig_1.FrameworkControllerTrialConfig(frameworkcontrollerTrialJsonObjsect.codeDir, frameworkcontrollerTrialJsonObjsect.taskRoles);
                try {
                    await util_1.validateCodeDir(this.fcTrialConfig.codeDir);
                    this.copyExpCodeDirPromise = this.uploadFolder(this.fcTrialConfig.codeDir, `nni/${experimentStartupInfo_1.getExperimentId()}/nni-code`);
                }
                catch (error) {
                    this.log.error(error);
                    return Promise.reject(new Error(error));
                }
                break;
            }
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.VERSION_CHECK:
                this.versionCheck = (value === 'true' || value === 'True');
                break;
            case trialConfigMetadataKey_1.TrialConfigMetadataKey.LOG_COLLECTION:
                this.logCollection = value;
                break;
            default:
        }
        return Promise.resolve();
    }
    async uploadFolder(srcDirectory, destDirectory) {
        if (this.fcClusterConfig === undefined) {
            throw new Error('Kubeflow Cluster config is not initialized');
        }
        assert(this.fcClusterConfig.storage === undefined
            || this.fcClusterConfig.storage === 'azureStorage'
            || this.fcClusterConfig.storage === 'nfs');
        if (this.fcClusterConfig.storage === 'azureStorage') {
            if (this.azureStorageClient === undefined) {
                throw new Error('azureStorageClient is not initialized');
            }
            const fcClusterConfigAzure = this.fcClusterConfig;
            return await this.uploadFolderToAzureStorage(srcDirectory, destDirectory, fcClusterConfigAzure.uploadRetryCount);
        }
        else if (this.fcClusterConfig.storage === 'nfs' || this.fcClusterConfig.storage === undefined) {
            await cpp.exec(`mkdir -p ${this.trialLocalNFSTempFolder}/${destDirectory}`);
            await cpp.exec(`cp -r ${srcDirectory}/* ${this.trialLocalNFSTempFolder}/${destDirectory}/.`);
            const fcClusterConfigNFS = this.fcClusterConfig;
            const nfsConfig = fcClusterConfigNFS.nfs;
            return `nfs://${nfsConfig.server}:${destDirectory}`;
        }
        return '';
    }
    generateCommandScript(command) {
        let portScript = '';
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        for (const taskRole of this.fcTrialConfig.taskRoles) {
            portScript += `FB_${taskRole.name.toUpperCase()}_PORT=${this.fcContainerPortMap.get(taskRole.name)} `;
        }
        return `${portScript} . /mnt/frameworkbarrier/injector.sh && ${command}`;
    }
    async prepareRunScript(trialLocalTempFolder, trialJobId, trialWorkingFolder, form) {
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        await cpp.exec(`mkdir -p ${trialLocalTempFolder}`);
        const installScriptContent = containerJobData_1.CONTAINER_INSTALL_NNI_SHELL_FORMAT;
        await fs.promises.writeFile(path.join(trialLocalTempFolder, 'install_nni.sh'), installScriptContent, { encoding: 'utf8' });
        for (const taskRole of this.fcTrialConfig.taskRoles) {
            const runScriptContent = await this.generateRunScript('frameworkcontroller', trialJobId, trialWorkingFolder, this.generateCommandScript(taskRole.command), form.sequenceId.toString(), taskRole.name, taskRole.gpuNum);
            await fs.promises.writeFile(path.join(trialLocalTempFolder, `run_${taskRole.name}.sh`), runScriptContent, { encoding: 'utf8' });
        }
        if (form !== undefined) {
            await fs.promises.writeFile(path.join(trialLocalTempFolder, utils_1.generateParamFileName(form.hyperParameters)), form.hyperParameters.value, { encoding: 'utf8' });
        }
    }
    async prepareFrameworkControllerConfig(trialJobId, trialWorkingFolder, frameworkcontrollerJobName) {
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        const podResources = [];
        for (const taskRole of this.fcTrialConfig.taskRoles) {
            const resource = {};
            resource.requests = this.generatePodResource(taskRole.memoryMB, taskRole.cpuNum, taskRole.gpuNum);
            resource.limits = { ...resource.requests };
            podResources.push(resource);
        }
        const frameworkcontrollerJobConfig = await this.generateFrameworkControllerJobConfig(trialJobId, trialWorkingFolder, frameworkcontrollerJobName, podResources);
        return Promise.resolve(frameworkcontrollerJobConfig);
    }
    generateContainerPort() {
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        let port = 4000;
        for (const index of this.fcTrialConfig.taskRoles.keys()) {
            this.fcContainerPortMap.set(this.fcTrialConfig.taskRoles[index].name, port);
            port += 1;
        }
    }
    async generateFrameworkControllerJobConfig(trialJobId, trialWorkingFolder, frameworkcontrollerJobName, podResources) {
        if (this.fcClusterConfig === undefined) {
            throw new Error('frameworkcontroller Cluster config is not initialized');
        }
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        const taskRoles = [];
        for (const index of this.fcTrialConfig.taskRoles.keys()) {
            const containerPort = this.fcContainerPortMap.get(this.fcTrialConfig.taskRoles[index].name);
            if (containerPort === undefined) {
                throw new Error('Container port is not initialized');
            }
            const taskRole = this.generateTaskRoleConfig(trialWorkingFolder, this.fcTrialConfig.taskRoles[index].image, `run_${this.fcTrialConfig.taskRoles[index].name}.sh`, podResources[index], containerPort, await this.createRegistrySecret(this.fcTrialConfig.taskRoles[index].privateRegistryAuthPath));
            taskRoles.push({
                name: this.fcTrialConfig.taskRoles[index].name,
                taskNumber: this.fcTrialConfig.taskRoles[index].taskNum,
                frameworkAttemptCompletionPolicy: {
                    minFailedTaskCount: this.fcTrialConfig.taskRoles[index].frameworkAttemptCompletionPolicy.minFailedTaskCount,
                    minSucceededTaskCount: this.fcTrialConfig.taskRoles[index].frameworkAttemptCompletionPolicy.minSucceededTaskCount
                },
                task: taskRole
            });
        }
        return Promise.resolve({
            apiVersion: `frameworkcontroller.microsoft.com/v1`,
            kind: 'Framework',
            metadata: {
                name: frameworkcontrollerJobName,
                namespace: 'default',
                labels: {
                    app: this.NNI_KUBERNETES_TRIAL_LABEL,
                    expId: experimentStartupInfo_1.getExperimentId(),
                    trialId: trialJobId
                }
            },
            spec: {
                executionType: 'Start',
                taskRoles: taskRoles
            }
        });
    }
    generateTaskRoleConfig(trialWorkingFolder, replicaImage, runScriptFile, podResources, containerPort, privateRegistrySecretName) {
        if (this.fcClusterConfig === undefined) {
            throw new Error('frameworkcontroller Cluster config is not initialized');
        }
        if (this.fcTrialConfig === undefined) {
            throw new Error('frameworkcontroller trial config is not initialized');
        }
        const volumeSpecMap = new Map();
        if (this.fcClusterConfig.storageType === 'azureStorage') {
            volumeSpecMap.set('nniVolumes', [
                {
                    name: 'nni-vol',
                    azureFile: {
                        secretName: `${this.azureStorageSecretName}`,
                        shareName: `${this.azureStorageShare}`,
                        readonly: false
                    }
                }, {
                    name: 'frameworkbarrier-volume',
                    emptyDir: {}
                }
            ]);
        }
        else {
            const frameworkcontrollerClusterConfigNFS = this.fcClusterConfig;
            volumeSpecMap.set('nniVolumes', [
                {
                    name: 'nni-vol',
                    nfs: {
                        server: `${frameworkcontrollerClusterConfigNFS.nfs.server}`,
                        path: `${frameworkcontrollerClusterConfigNFS.nfs.path}`
                    }
                }, {
                    name: 'frameworkbarrier-volume',
                    emptyDir: {}
                }
            ]);
        }
        const containers = [
            {
                name: 'framework',
                image: replicaImage,
                command: ['sh', `${path.join(trialWorkingFolder, runScriptFile)}`],
                volumeMounts: [
                    {
                        name: 'nni-vol',
                        mountPath: this.CONTAINER_MOUNT_PATH
                    }, {
                        name: 'frameworkbarrier-volume',
                        mountPath: '/mnt/frameworkbarrier'
                    }
                ],
                resources: podResources,
                ports: [{
                        containerPort: containerPort
                    }]
            }
        ];
        const initContainers = [
            {
                name: 'frameworkbarrier',
                image: 'frameworkcontroller/frameworkbarrier',
                volumeMounts: [
                    {
                        name: 'frameworkbarrier-volume',
                        mountPath: '/mnt/frameworkbarrier'
                    }
                ]
            }
        ];
        const spec = {
            containers: containers,
            initContainers: initContainers,
            restartPolicy: 'OnFailure',
            volumes: volumeSpecMap.get('nniVolumes'),
            hostNetwork: false
        };
        if (privateRegistrySecretName) {
            spec.imagePullSecrets = [
                {
                    name: privateRegistrySecretName
                }
            ];
        }
        if (this.fcClusterConfig.serviceAccountName !== undefined) {
            spec.serviceAccountName = this.fcClusterConfig.serviceAccountName;
        }
        return {
            pod: {
                spec: spec
            }
        };
    }
};
FrameworkControllerTrainingService = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], FrameworkControllerTrainingService);
exports.FrameworkControllerTrainingService = FrameworkControllerTrainingService;
