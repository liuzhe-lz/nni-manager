"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DLTSTrialJobDetail {
    constructor(id, status, submitTime, workingDirectory, form, dltsJobName) {
        this.id = id;
        this.status = status;
        this.submitTime = submitTime;
        this.workingDirectory = workingDirectory;
        this.form = form;
        this.dltsJobName = dltsJobName;
        this.dltsPaused = false;
    }
}
exports.DLTSTrialJobDetail = DLTSTrialJobDetail;
