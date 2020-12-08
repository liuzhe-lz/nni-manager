'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const kubernetesApiClient_1 = require("../kubernetesApiClient");
exports.GeneralK8sClient = kubernetesApiClient_1.GeneralK8sClient;
class AdlClientV1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/adl/adaptdl-crd-v1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['adaptdl.petuum.com'].v1.namespaces('default').adaptdljobs;
    }
    get containerName() {
        return 'main';
    }
    async getKubernetesPods(jobName) {
        let result;
        const response = await this.client.api.v1.namespaces('default').pods
            .get({ qs: { labelSelector: `adaptdl/job=${jobName}` } });
        if (response.statusCode && (response.statusCode >= 200 && response.statusCode <= 299)) {
            result = Promise.resolve(response.body);
        }
        else {
            result = Promise.reject(`AdlClient getKubernetesPods failed, statusCode is ${response.statusCode}`);
        }
        return result;
    }
}
exports.AdlClientV1 = AdlClientV1;
class AdlClientFactory {
    static createClient() {
        return new AdlClientV1();
    }
}
exports.AdlClientFactory = AdlClientFactory;
