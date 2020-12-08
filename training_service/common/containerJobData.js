'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTAINER_INSTALL_NNI_SHELL_FORMAT = `#!/bin/bash
if python3 -c 'import nni' > /dev/null 2>&1; then
  # nni module is already installed, skip
  return
else
  # Install nni
  python3 -m pip install --user --upgrade nni
fi`;
