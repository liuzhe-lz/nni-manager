'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path = require("path");
const component = require("../common/component");
const datastore_1 = require("../common/datastore");
const errors_1 = require("../common/errors");
const experimentStartupInfo_1 = require("../common/experimentStartupInfo");
const log_1 = require("../common/log");
const manager_1 = require("../common/manager");
const experimentManager_1 = require("../common/experimentManager");
const restValidationSchemas_1 = require("./restValidationSchemas");
const utils_1 = require("../common/utils");
const expressJoi = require('express-joi-validator');
class NNIRestHandler {
    constructor(rs) {
        this.nniManager = component.get(manager_1.Manager);
        this.experimentsManager = component.get(experimentManager_1.ExperimentManager);
        this.restServer = rs;
        this.log = log_1.getLogger();
    }
    createRestHandler() {
        const router = express_1.Router();
        router.use((req, res, next) => {
            this.log.debug(`${req.method}: ${req.url}: body:\n${JSON.stringify(req.body, undefined, 4)}`);
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
            res.setHeader('Content-Type', 'application/json');
            next();
        });
        this.version(router);
        this.checkStatus(router);
        this.getExperimentProfile(router);
        this.updateExperimentProfile(router);
        this.importData(router);
        this.getImportedData(router);
        this.startExperiment(router);
        this.getTrialJobStatistics(router);
        this.setClusterMetaData(router);
        this.listTrialJobs(router);
        this.getTrialJob(router);
        this.addTrialJob(router);
        this.cancelTrialJob(router);
        this.getMetricData(router);
        this.getMetricDataByRange(router);
        this.getLatestMetricData(router);
        this.getTrialLog(router);
        this.exportData(router);
        this.getExperimentsInfo(router);
        router.use((err, _req, res, _next) => {
            if (err.isBoom) {
                this.log.error(err.output.payload);
                return res.status(err.output.statusCode).json(err.output.payload);
            }
        });
        return router;
    }
    handleError(err, res, isFatal = false, errorCode = 500) {
        if (err instanceof errors_1.NNIError && err.name === errors_1.NNIErrorNames.NOT_FOUND) {
            res.status(404);
        }
        else {
            res.status(errorCode);
        }
        res.send({
            error: err.message
        });
        if (isFatal) {
            this.log.fatal(err);
            process.exit(1);
        }
        else {
            this.log.error(err);
        }
    }
    version(router) {
        router.get('/version', async (req, res) => {
            const version = await utils_1.getVersion();
            res.send(version);
        });
    }
    checkStatus(router) {
        router.get('/check-status', (req, res) => {
            const ds = component.get(datastore_1.DataStore);
            ds.init().then(() => {
                res.send(this.nniManager.getStatus());
            }).catch(async (err) => {
                this.handleError(err, res);
                this.log.error(err.message);
                this.log.error(`Datastore initialize failed, stopping rest server...`);
                await this.restServer.stop();
            });
        });
    }
    getExperimentProfile(router) {
        router.get('/experiment', (req, res) => {
            this.nniManager.getExperimentProfile().then((profile) => {
                res.send(profile);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    updateExperimentProfile(router) {
        router.put('/experiment', expressJoi(restValidationSchemas_1.ValidationSchemas.UPDATEEXPERIMENT), (req, res) => {
            this.nniManager.updateExperimentProfile(req.body, req.query.update_type).then(() => {
                res.send();
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    importData(router) {
        router.post('/experiment/import-data', (req, res) => {
            this.nniManager.importData(JSON.stringify(req.body)).then(() => {
                res.send();
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getImportedData(router) {
        router.get('/experiment/imported-data', (req, res) => {
            this.nniManager.getImportedData().then((importedData) => {
                res.send(JSON.stringify(importedData));
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    startExperiment(router) {
        router.post('/experiment', expressJoi(restValidationSchemas_1.ValidationSchemas.STARTEXPERIMENT), (req, res) => {
            if (experimentStartupInfo_1.isNewExperiment()) {
                this.nniManager.startExperiment(req.body).then((eid) => {
                    res.send({
                        experiment_id: eid
                    });
                }).catch((err) => {
                    this.handleError(err, res);
                });
            }
            else {
                this.nniManager.resumeExperiment(experimentStartupInfo_1.isReadonly()).then(() => {
                    res.send();
                }).catch((err) => {
                    this.handleError(err, res);
                });
            }
        });
    }
    getTrialJobStatistics(router) {
        router.get('/job-statistics', (req, res) => {
            this.nniManager.getTrialJobStatistics().then((statistics) => {
                res.send(statistics);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    setClusterMetaData(router) {
        router.put('/experiment/cluster-metadata', expressJoi(restValidationSchemas_1.ValidationSchemas.SETCLUSTERMETADATA), async (req, res) => {
            const metadata = req.body;
            const keys = Object.keys(metadata);
            try {
                for (const key of keys) {
                    await this.nniManager.setClusterMetadata(key, JSON.stringify(metadata[key]));
                }
                res.send();
            }
            catch (err) {
                this.handleError(errors_1.NNIError.FromError(err), res, true);
            }
        });
    }
    listTrialJobs(router) {
        router.get('/trial-jobs', (req, res) => {
            this.nniManager.listTrialJobs(req.query.status).then((jobInfos) => {
                jobInfos.forEach((trialJob) => {
                    this.setErrorPathForFailedJob(trialJob);
                    this.setMessageforJob(trialJob);
                });
                res.send(jobInfos);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getTrialJob(router) {
        router.get('/trial-jobs/:id', (req, res) => {
            this.nniManager.getTrialJob(req.params.id).then((jobDetail) => {
                const jobInfo = this.setErrorPathForFailedJob(jobDetail);
                this.setMessageforJob(jobInfo);
                res.send(jobInfo);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    addTrialJob(router) {
        router.post('/trial-jobs', async (req, res) => {
            this.nniManager.addCustomizedTrialJob(JSON.stringify(req.body)).then((sequenceId) => {
                res.send({ sequenceId });
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    cancelTrialJob(router) {
        router.delete('/trial-jobs/:id', async (req, res) => {
            this.nniManager.cancelTrialJobByUser(req.params.id).then(() => {
                res.send();
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getMetricData(router) {
        router.get('/metric-data/:job_id*?', async (req, res) => {
            this.nniManager.getMetricData(req.params.job_id, req.query.type).then((metricsData) => {
                res.send(metricsData);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getMetricDataByRange(router) {
        router.get('/metric-data-range/:min_seq_id/:max_seq_id', async (req, res) => {
            const minSeqId = Number(req.params.min_seq_id);
            const maxSeqId = Number(req.params.max_seq_id);
            this.nniManager.getMetricDataByRange(minSeqId, maxSeqId).then((metricsData) => {
                res.send(metricsData);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getLatestMetricData(router) {
        router.get('/metric-data-latest/', async (req, res) => {
            this.nniManager.getLatestMetricData().then((metricsData) => {
                res.send(metricsData);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getTrialLog(router) {
        router.get('/trial-log/:id/:type', async (req, res) => {
            this.nniManager.getTrialLog(req.params.id, req.params.type).then((log) => {
                if (log === '') {
                    log = 'No logs available.';
                }
                res.send(log);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    exportData(router) {
        router.get('/export-data', (req, res) => {
            this.nniManager.exportData().then((exportedData) => {
                res.send(exportedData);
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    getExperimentsInfo(router) {
        router.get('/experiments-info', (req, res) => {
            this.experimentsManager.getExperimentsInfo().then((experimentInfo) => {
                res.send(JSON.stringify(experimentInfo));
            }).catch((err) => {
                this.handleError(err, res);
            });
        });
    }
    setErrorPathForFailedJob(jobInfo) {
        if (jobInfo === undefined || jobInfo.status !== 'FAILED' || jobInfo.logPath === undefined) {
            return jobInfo;
        }
        jobInfo.stderrPath = path.join(jobInfo.logPath, 'stderr');
        return jobInfo;
    }
    setMessageforJob(jobInfo) {
        if (jobInfo === undefined) {
            return jobInfo;
        }
        jobInfo.message = this.nniManager.getTrialJobMessage(jobInfo.trialJobId);
        return jobInfo;
    }
}
function createRestHandler(rs) {
    const handler = new NNIRestHandler(rs);
    return handler.createRestHandler();
}
exports.createRestHandler = createRestHandler;
