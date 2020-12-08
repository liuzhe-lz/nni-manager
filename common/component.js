'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ioc = require("typescript-ioc");
const Inject = ioc.Inject;
exports.Inject = Inject;
const Singleton = ioc.Singleton;
exports.Singleton = Singleton;
const Container = ioc.Container;
exports.Container = Container;
const Provides = ioc.Provides;
exports.Provides = Provides;
function get(source) {
    return ioc.Container.get(source);
}
exports.get = get;
