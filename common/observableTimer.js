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
const rx = require("rx");
const component = require("../common/component");
let ObservableTimer = class ObservableTimer {
    constructor() {
        this.observableSource = rx.Observable.timer(100, 1000).takeWhile(() => true);
    }
    subscribe(onNext, onError, onCompleted) {
        return this.observableSource.subscribe(onNext, onError, onCompleted);
    }
    unsubscribe(subscription) {
        if (typeof subscription !== 'undefined') {
            subscription.dispose();
        }
    }
};
ObservableTimer = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], ObservableTimer);
exports.ObservableTimer = ObservableTimer;
