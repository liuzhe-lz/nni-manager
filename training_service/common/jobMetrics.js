'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class JobMetrics {
    constructor(jobId, metrics, jobStatus, endTimestamp) {
        this.jobId = jobId;
        this.metrics = metrics;
        this.jobStatus = jobStatus;
        this.endTimestamp = endTimestamp;
    }
}
exports.JobMetrics = JobMetrics;
