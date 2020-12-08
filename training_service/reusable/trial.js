'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class TrialDetail {
    constructor(id, status, submitTime, workingDirectory, form) {
        this.settings = {};
        this.TRIAL_METADATA_DIR = ".nni";
        this.id = id;
        this.status = status;
        this.submitTime = submitTime;
        this.workingDirectory = workingDirectory;
        this.form = form;
        this.tags = [];
        this.nodes = new Map();
    }
}
exports.TrialDetail = TrialDetail;
