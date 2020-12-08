'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const log_1 = require("../../common/log");
const utils_1 = require("../../common/utils");
const gpuData_1 = require("../common/gpuData");
class GpuSchedulerSetting {
    constructor() {
        this.useActiveGpu = false;
        this.maxTrialNumberPerGpu = 1;
    }
}
exports.GpuSchedulerSetting = GpuSchedulerSetting;
class GpuScheduler {
    constructor(gpuSchedulerSetting = undefined) {
        this.log = log_1.getLogger();
        this.policyName = 'round-robin';
        this.roundRobinIndex = 0;
        if (undefined === gpuSchedulerSetting) {
            gpuSchedulerSetting = new GpuSchedulerSetting();
        }
        this.defaultSetting = gpuSchedulerSetting;
    }
    setSettings(gpuSchedulerSetting) {
        this.defaultSetting = gpuSchedulerSetting;
    }
    scheduleMachine(environments, requiredGPUNum, trialDetail) {
        if (requiredGPUNum === undefined) {
            requiredGPUNum = 0;
        }
        assert(requiredGPUNum >= 0);
        const eligibleEnvironments = environments.filter((environment) => environment.defaultGpuSummary === undefined || requiredGPUNum === 0 || (requiredGPUNum !== undefined && environment.defaultGpuSummary.gpuCount >= requiredGPUNum));
        if (eligibleEnvironments.length === 0) {
            return ({
                resultType: gpuData_1.ScheduleResultType.REQUIRE_EXCEED_TOTAL,
                gpuIndices: undefined,
                environment: undefined,
            });
        }
        if (requiredGPUNum > 0) {
            const result = this.scheduleGPUHost(environments, requiredGPUNum, trialDetail);
            if (result !== undefined) {
                return result;
            }
        }
        else {
            const allocatedRm = this.selectMachine(environments, environments);
            return this.allocateHost(requiredGPUNum, allocatedRm, [], trialDetail);
        }
        return {
            resultType: gpuData_1.ScheduleResultType.TMP_NO_AVAILABLE_GPU,
            gpuIndices: undefined,
            environment: undefined,
        };
    }
    removeGpuReservation(trial) {
        if (trial.environment !== undefined &&
            trial.environment.defaultGpuSummary !== undefined &&
            trial.assignedGpus !== undefined &&
            trial.assignedGpus.length > 0) {
            for (const gpuInfo of trial.assignedGpus) {
                const defaultGpuSummary = trial.environment.defaultGpuSummary;
                const num = defaultGpuSummary.assignedGpuIndexMap.get(gpuInfo.index);
                if (num !== undefined) {
                    if (num === 1) {
                        defaultGpuSummary.assignedGpuIndexMap.delete(gpuInfo.index);
                    }
                    else {
                        defaultGpuSummary.assignedGpuIndexMap.set(gpuInfo.index, num - 1);
                    }
                }
            }
        }
    }
    scheduleGPUHost(environments, requiredGPUNumber, trial) {
        const totalResourceMap = this.gpuResourceDetection(environments);
        const qualifiedEnvironments = [];
        totalResourceMap.forEach((gpuInfos, environment) => {
            if (gpuInfos !== undefined && gpuInfos.length >= requiredGPUNumber) {
                qualifiedEnvironments.push(environment);
            }
        });
        if (qualifiedEnvironments.length > 0) {
            const allocatedEnvironment = this.selectMachine(qualifiedEnvironments, environments);
            const gpuInfos = totalResourceMap.get(allocatedEnvironment);
            if (gpuInfos !== undefined) {
                return this.allocateHost(requiredGPUNumber, allocatedEnvironment, gpuInfos, trial);
            }
            else {
                assert(false, 'gpuInfos is undefined');
            }
        }
    }
    gpuResourceDetection(environments) {
        const totalResourceMap = new Map();
        environments.forEach((environment) => {
            if (environment.defaultGpuSummary !== undefined) {
                const defaultGpuSummary = environment.defaultGpuSummary;
                const availableGPUs = [];
                const designatedGpuIndices = new Set(environment.usableGpus);
                if (designatedGpuIndices.size > 0) {
                    for (const gpuIndex of designatedGpuIndices) {
                        if (gpuIndex >= environment.defaultGpuSummary.gpuCount) {
                            throw new Error(`Specified GPU index not found: ${gpuIndex}`);
                        }
                    }
                }
                if (undefined !== defaultGpuSummary.gpuInfos) {
                    defaultGpuSummary.gpuInfos.forEach((gpuInfo) => {
                        if (designatedGpuIndices.size === 0 || designatedGpuIndices.has(gpuInfo.index)) {
                            if (defaultGpuSummary.assignedGpuIndexMap !== undefined) {
                                const num = defaultGpuSummary.assignedGpuIndexMap.get(gpuInfo.index);
                                const maxTrialNumberPerGpu = environment.maxTrialNumberPerGpu ? environment.maxTrialNumberPerGpu : this.defaultSetting.maxTrialNumberPerGpu;
                                const useActiveGpu = environment.useActiveGpu ? environment.useActiveGpu : this.defaultSetting.useActiveGpu;
                                if ((num === undefined && (!useActiveGpu && gpuInfo.activeProcessNum === 0 || useActiveGpu)) ||
                                    (num !== undefined && num < maxTrialNumberPerGpu)) {
                                    availableGPUs.push(gpuInfo);
                                }
                            }
                            else {
                                throw new Error(`occupiedGpuIndexMap is undefined!`);
                            }
                        }
                    });
                }
                totalResourceMap.set(environment, availableGPUs);
            }
        });
        return totalResourceMap;
    }
    selectMachine(qualifiedEnvironments, allEnvironments) {
        assert(qualifiedEnvironments !== undefined && qualifiedEnvironments.length > 0);
        if (this.policyName === 'random') {
            return utils_1.randomSelect(qualifiedEnvironments);
        }
        else if (this.policyName === 'round-robin') {
            return this.roundRobinSelect(qualifiedEnvironments, allEnvironments);
        }
        else {
            throw new Error(`Unsupported schedule policy: ${this.policyName}`);
        }
    }
    roundRobinSelect(qualifiedEnvironments, allEnvironments) {
        while (!qualifiedEnvironments.includes(allEnvironments[this.roundRobinIndex % allEnvironments.length])) {
            this.roundRobinIndex++;
        }
        return allEnvironments[this.roundRobinIndex++ % allEnvironments.length];
    }
    selectGPUsForTrial(gpuInfos, requiredGPUNum) {
        return gpuInfos.slice(0, requiredGPUNum);
    }
    allocateHost(requiredGPUNum, environment, gpuInfos, trialDetails) {
        assert(gpuInfos.length >= requiredGPUNum);
        const allocatedGPUs = this.selectGPUsForTrial(gpuInfos, requiredGPUNum);
        const defaultGpuSummary = environment.defaultGpuSummary;
        if (undefined === defaultGpuSummary) {
            throw new Error(`Environment ${environment.id} defaultGpuSummary shouldn't be undefined!`);
        }
        allocatedGPUs.forEach((gpuInfo) => {
            let num = defaultGpuSummary.assignedGpuIndexMap.get(gpuInfo.index);
            if (num === undefined) {
                num = 0;
            }
            defaultGpuSummary.assignedGpuIndexMap.set(gpuInfo.index, num + 1);
        });
        trialDetails.assignedGpus = allocatedGPUs;
        return {
            resultType: gpuData_1.ScheduleResultType.SUCCEED,
            environment: environment,
            gpuIndices: allocatedGPUs,
        };
    }
}
exports.GpuScheduler = GpuScheduler;
