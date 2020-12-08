'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class OsCommands {
    constructor() {
        this.pathSpliter = '/';
        this.multiplePathSpliter = new RegExp(`[\\\\/]{2,}`);
        this.normalizePath = new RegExp(`[\\\\/]`);
    }
    joinPath(...paths) {
        let dir = paths.filter((path) => path !== '').join(this.pathSpliter);
        if (dir === '') {
            dir = '.';
        }
        else {
            dir = dir.replace(this.normalizePath, this.pathSpliter);
            dir = dir.replace(this.multiplePathSpliter, this.pathSpliter);
        }
        return dir;
    }
}
exports.OsCommands = OsCommands;
