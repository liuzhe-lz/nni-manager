"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DLTSJobConfig {
    constructor(clusterConfig, jobName, resourcegpu, image, cmd, interactivePorts) {
        this.jobName = jobName;
        this.resourcegpu = resourcegpu;
        this.image = image;
        this.cmd = cmd;
        this.interactivePorts = interactivePorts;
        this.jobType = "training";
        this.jobtrainingtype = "RegularJob";
        this.ssh = false;
        this.ipython = false;
        this.tensorboard = false;
        this.workPath = '';
        this.enableworkpath = true;
        this.dataPath = '';
        this.enabledatapath = false;
        this.jobPath = '';
        this.enablejobpath = true;
        this.mountpoints = [];
        this.env = [{ name: 'TMPDIR', value: '$HOME/tmp' }];
        this.hostNetwork = false;
        this.useGPUTopology = false;
        this.isPrivileged = false;
        this.hostIPC = false;
        this.preemptionAllowed = "False";
        if (clusterConfig.gpuType === undefined) {
            throw Error('GPU type not fetched');
        }
        this.vcName = this.team = clusterConfig.team;
        this.gpuType = clusterConfig.gpuType;
        this.userName = clusterConfig.email;
    }
}
exports.DLTSJobConfig = DLTSJobConfig;
