'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const errors_1 = require("../../common/errors");
const log_1 = require("../../common/log");
class KubernetesJobInfoCollector {
    constructor(jobMap) {
        this.log = log_1.getLogger();
        this.trialJobsMap = jobMap;
        this.statusesNeedToCheck = ['RUNNING', 'WAITING'];
    }
    async retrieveTrialStatus(kubernetesCRDClient) {
        assert(kubernetesCRDClient !== undefined);
        const updateKubernetesTrialJobs = [];
        for (const [trialJobId, kubernetesTrialJob] of this.trialJobsMap) {
            if (kubernetesTrialJob === undefined) {
                throw new errors_1.NNIError(errors_1.NNIErrorNames.NOT_FOUND, `trial job id ${trialJobId} not found`);
            }
            updateKubernetesTrialJobs.push(this.retrieveSingleTrialJobInfo(kubernetesCRDClient, kubernetesTrialJob));
        }
        return Promise.all(updateKubernetesTrialJobs);
    }
    async retrieveSingleTrialJobInfo(_kubernetesCRDClient, _kubernetesTrialJob) {
        throw new errors_1.MethodNotImplementedError();
    }
}
exports.KubernetesJobInfoCollector = KubernetesJobInfoCollector;
